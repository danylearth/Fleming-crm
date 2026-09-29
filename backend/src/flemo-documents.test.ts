import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
vi.mock('./db-pg',()=>({default:{connect:vi.fn()},query:vi.fn(),queryOne:vi.fn(),run:vi.fn()}));
vi.mock('./flemo-oauth',()=>({flemoAccount:vi.fn(),sharedFlemoOwner:vi.fn()}));
import pool,{query,queryOne} from './db-pg';import {applyFlemoDocuments,registerFlemoDocumentRoutes} from './flemo-documents';
import {generateToken} from './auth';import express from 'express';
const user={id:5,name:'Marie Example',email:'marie@example.test',role:'staff'},upload='f15d8c12-1d9b-4c31-a5ee-5eec33ed7b8f';
let root:string,sql:ReturnType<typeof vi.fn>,release:ReturnType<typeof vi.fn>,plan:any,claimed=false,deny=false,failAudit=false;
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'flemo-test-'));process.env.UPLOADS_PATH=path.join(root,'uploads');fs.mkdirSync(path.join(root,'private-flemo-documents'));fs.writeFileSync(path.join(root,'private-flemo-documents','id.pdf'),'%PDF-1.7 fictional');claimed=false;deny=false;failAudit=false;
 plan={kind:'document_batch',status:'ready',portfolio:'all',items:[{upload_id:upload,doc_type:'Primary Identification',summary:'Test ID'}],targets:[{key:'tenant:4',id:4,entity_type:'tenant',label:'Joe Example'}],result:{text:'Already saved'}};
 vi.mocked(query).mockResolvedValue(plan.targets);release=vi.fn();sql=vi.fn(async(statement:string,params?:any[])=>{
 if(statement.startsWith('SELECT * FROM ai_action_requests'))return {rows:deny?[]:[{payload:plan,claimed_at:claimed?'2026-09-29':null}]};
 if(statement.startsWith('SELECT * FROM ai_document_uploads'))return {rows:[{id:upload,filename:'id.pdf',original_name:'ID.pdf',mime_type:'application/pdf',size:18,sha256:crypto.createHash('sha256').update('%PDF-1.7 fictional').digest('hex')}]};
 if(statement.startsWith('SELECT * FROM documents'))return {rows:[]};
 if(statement.startsWith('INSERT INTO documents'))return {rows:[{id:80,review_status:params?.[8]}]};
 if(failAudit&&statement.startsWith('INSERT INTO audit_log'))throw Error('Database unavailable');
 return {rows:[]};});vi.mocked(pool.connect).mockResolvedValue({query:sql,release} as never);
});
afterEach(()=>{fs.rmSync(root,{recursive:true,force:true});delete process.env.UPLOADS_PATH;});
const changes=()=>[{upload_id:upload,target_key:'tenant:4',doc_type:'Primary Identification',update_compliance:false}];
it('files private IDs pending review and audits the actual user via FlemoAI',async()=>{const result=await applyFlemoDocuments('request',user,changes());expect(result.items[0].review_status).toBe('pending');const doc=sql.mock.calls.find(([s])=>s.startsWith('INSERT INTO documents'))!;expect(doc[1]?.[7]).toBe(5);const audit=sql.mock.calls.find(([s])=>s.startsWith('INSERT INTO audit_log'))!;expect(audit[1]?.slice(0,4)).toEqual([5,user.email,'tenant',4]);expect(JSON.parse(audit[1]?.[4])).toMatchObject({via:'FlemoAI',user_name:'Marie Example',document_id:80});expect(sql.mock.calls.some(([s])=>s.startsWith('UPDATE tenants'))).toBe(false);expect(sql).toHaveBeenCalledWith('COMMIT');});
it('scopes reviews and uploads to the current user',async()=>{await applyFlemoDocuments('request',user,changes());for(const prefix of ['SELECT * FROM ai_action_requests','SELECT * FROM ai_document_uploads']){const call=sql.mock.calls.find(([s])=>s.startsWith(prefix))!;expect(call[0]).toContain('user_id=$2');expect(call[1]?.[1]).toBe(5);}deny=true;await expect(applyFlemoDocuments('other-user-request',user,changes())).rejects.toThrow('expired');});
it('replaying an applied request returns its result without another file or audit',async()=>{claimed=true;expect(await applyFlemoDocuments('request',user,changes())).toEqual(plan.result);expect(sql.mock.calls.some(([s])=>s.startsWith('INSERT'))).toBe(false);});
it('rolls back and removes its copied file if the audit write fails',async()=>{failAudit=true;await expect(applyFlemoDocuments('request',user,changes())).rejects.toThrow('Database unavailable');expect(sql).toHaveBeenCalledWith('ROLLBACK');expect(fs.readdirSync(path.join(root,'uploads'))).toEqual([]);expect(fs.existsSync(path.join(root,'private-flemo-documents','id.pdf'))).toBe(true);});
it('rejects destinations outside the currently available records before copying',async()=>{await expect(applyFlemoDocuments('request',user,[{...changes()[0],target_key:'tenant:999'}])).rejects.toThrow('available record');expect(fs.existsSync(path.join(root,'uploads'))).toBe(false);});
it('does not permit a viewer to call the filing service or target financial records',async()=>{await expect(applyFlemoDocuments('request',{...user,role:'viewer'},changes())).rejects.toThrow('access level');await expect(applyFlemoDocuments('request',user,[{...changes()[0],target_key:'bank_transaction:4'}])).rejects.toThrow('available record');});
it('checks current server-side roles on every document route, including a downgraded admin token',async()=>{
 const app=express();app.use(express.json());registerFlemoDocumentRoutes(app);const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));const origin='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port;
 const token=generateToken({...user,role:'admin'});vi.mocked(queryOne).mockResolvedValue({...user,role:'viewer',is_active:1,password_setup_required:false});
 try{for(const [method,url] of [['POST','/api/ai/attachments'],['GET','/api/ai/attachments/'+upload],['POST','/api/ai/document-reviews'],['GET','/api/ai/document-reviews/'+upload],['POST','/api/ai/document-reviews/'+upload+'/apply']]){const r=await fetch(origin+url,{method,headers:{Authorization:'Bearer '+token}});expect(r.status).toBe(403);}
 for(const role of ['staff','manager','admin']){vi.mocked(queryOne).mockResolvedValue({...user,role,is_active:1,password_setup_required:false});const r=await fetch(origin+'/api/ai/attachments',{method:'POST',headers:{Authorization:'Bearer '+token}});expect(r.status).toBe(400);}
 vi.mocked(queryOne).mockResolvedValue({...user,is_active:0});expect((await fetch(origin+'/api/ai/attachments/'+upload,{headers:{Authorization:'Bearer '+token}})).status).toBe(401);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
