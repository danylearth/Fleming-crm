import {readFileSync} from 'node:fs';
import {createServer, type Server} from 'node:http';
import express from 'express';
import multer from 'multer';
import ts from 'typescript';
import {afterEach,describe,expect,it,vi} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {creditReportResult,isValidManualCreditScore} from './credit-report-result';

const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));});

async function uploadThroughGate(gateError:string|null,score='250'){
 const app=express();app.use(express.json());
 const source=readFileSync(new URL('./index-pg.ts',import.meta.url),'utf8');
 const start=source.indexOf("app.use('/api/tenant-enquiries/:id',authMiddleware,async");
 const end=source.indexOf('registerRecordNoteRoutes(app);',start);
 const middleware=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const serviceGate=vi.fn(async()=>gateError);
 const queryOne=vi.fn(async()=>({id:84,linked_property_id:24,status:'onboarding',application_review_status:'approved'}));
 new Function('app','authMiddleware','queryOne','serviceGate',middleware)(app,(_req:unknown,_res:unknown,next:()=>void)=>next(),queryOne,serviceGate);
 const routeStart=source.indexOf("app.post('/api/tenant-enquiries/:id/credit-check'");
 const routeEnd=source.indexOf('const AGREEMENT_COMPLIANCE_TYPES',routeStart);
 const route=ts.transpileModule(source.slice(routeStart,routeEnd),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const client={query:vi.fn(async()=>({rows:[]})),release:vi.fn()};
 const upload={single:(field:string)=>[multer({storage:multer.memoryStorage()}).single(field),(req:express.Request,_res:express.Response,next:()=>void)=>{if(req.file)req.file.filename='fictional-memory-only-report.pdf';next();}]};
 new Function('app','authMiddleware','requirePermission','upload','uploadsDir','path','fs','creditReportResult','isValidManualCreditScore','queryOne','pool','logAudit','linkedEntityIds','assertGuarantorsReady',route)(app,(_req:unknown,_res:unknown,next:()=>void)=>next(),()=> (_req:unknown,_res:unknown,next:()=>void)=>next(),upload,'tmp',path,fs,creditReportResult,isValidManualCreditScore,queryOne,{connect:async()=>client},vi.fn(),async()=>[84],vi.fn(async()=>{}));
 const server=createServer(app);servers.push(server);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('Test server unavailable');
 const body=new FormData();body.append('score',score);body.append('result',JSON.stringify({rating:'Excellent',bankruptcy:false}));body.append('report',new Blob(['fictional test report'],{type:'application/pdf'}),'test-credit-report.pdf');
 const response=await fetch(`http://127.0.0.1:${address.port}/api/tenant-enquiries/84/credit-check`,{method:'POST',body});
 return {response,result:await response.json(),serviceGate,client};
}

describe('credit report multipart upload through the service agreement gate',()=>{
 it('allows valid uploads before multer has populated req.body',async()=>{
  const {response,result,serviceGate,client}=await uploadThroughGate(null);
  expect(response.status).toBe(200);
  expect(result).toEqual({success:true,score:'250',rating:'EXCELLENT',reference:null,report:'test-credit-report.pdf'});
  expect(serviceGate).toHaveBeenCalledWith(24);
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(client.query.mock.calls.some(([sql])=>String(sql).includes('credit_check_completed = 1'))).toBe(true);
 });
 it('still enforces the service agreement requirement for uploaded reports',async()=>{
  const {response,result}=await uploadThroughGate('Service agreement required');
  expect(response.status).toBe(409);
  expect(result.error).toBe('Service agreement required');
 });
 it('rejects a rating-only upload without committing a credit result',async()=>{
  const {response,result,client}=await uploadThroughGate(null,'');
  expect(response.status).toBe(400);
  expect(result.error).toBe('Enter a numeric credit score');
  expect(client.query).not.toHaveBeenCalled();
 });
});
