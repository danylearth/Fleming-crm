import {readFileSync} from 'node:fs';
import {createServer,type Server} from 'node:http';
import express from 'express';
import ts from 'typescript';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {requirePermission} from './auth';
import {validateHoldingDepositReset} from './holding-deposit-reset';

const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>s.close(()=>r()))));});
async function resetThroughRoute(kind='holding_deposit',participant=10,role='staff') {
 const app=express();app.use(express.json());
 const allocations=[{id:90,kind,amount:346,rent_payment_id:null}];
 const client={release:vi.fn(),query:vi.fn(async(sql:string)=>{
  if(sql.startsWith('SELECT * FROM bank_feed_transactions'))return {rows:[{id:900,amount:346,currency:'GBP'}]};
  if(sql.startsWith('SELECT * FROM tenant_enquiries'))return {rows:[{id:10,status:'onboarding'},{id:11,status:'onboarding'}]};
  if(sql.startsWith('SELECT id,kind FROM bank_feed_allocations')||sql.startsWith('SELECT * FROM bank_feed_allocations'))return {rows:allocations};
  if(sql.startsWith('SELECT ap.allocation_id'))return {rows:[{allocation_id:90,enquiry_id:participant}]};
  if(sql.includes("a.kind='holding_deposit'"))return {rows:[{enquiry_id:10}]};
  return {rows:[]};
 })};
 const source=readFileSync(new URL('./bank-reconciliation.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source.slice(source.indexOf(' const reconcileTransaction='),source.indexOf(" app.post('/api/tenant-enquiries/:id/allocate-balance'")),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const refresh=vi.fn(async()=>{}),connect=vi.fn(async()=>client);
 const deps={app,pool:{connect},authMiddleware:(req:any,_res:any,next:()=>void)=>{req.user={id:1,email:'test@example.test',role};next();},requirePermission,requireFinance:(_req:any,_res:any,next:()=>void)=>next(),holdingParticipantGroups:async(_c:any,people:any[])=>people.length?[[10,11]]:[],validateHoldingDepositReset,refreshHoldingDeposit:refresh,refreshFinalBalance:vi.fn(),recalculateRent:vi.fn()};
 new Function(...Object.keys(deps),code)(...Object.values(deps));
 const server=createServer(app);servers.push(server);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('No test server');
 const response=await fetch(`http://127.0.0.1:${address.port}/api/tenant-enquiries/10/reset-holding-deposit-payment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transaction_id:900,action:'ignore'})});
 return {response,result:await response.json(),client,refresh,connect};
}
describe('scoped holding-deposit reset',()=>{
 it('reverses the allocation, preserves bank history and refreshes both joint applicants',async()=>{
  const {response,client,refresh}=await resetThroughRoute();expect(response.status).toBe(200);
  expect(client.query.mock.calls.some(([sql])=>sql.startsWith('UPDATE bank_feed_allocations SET reversed_at=NOW()'))).toBe(true);
  expect(client.query.mock.calls.some(([sql])=>/^DELETE /i.test(sql))).toBe(false);
  expect(client.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO audit_log'))).toBe(true);
  expect(refresh).toHaveBeenCalledWith(client,[10,11]);expect(client.query).toHaveBeenCalledWith('COMMIT');
 });
 it.each([['rent',10],['holding_deposit',99]])('refuses other allocations or another application: %s / %i',async(kind,participant)=>{
  const {response,client,refresh}=await resetThroughRoute(kind,participant);expect(response.status).toBe(400);
  expect(client.query.mock.calls.some(([sql])=>sql.startsWith('UPDATE '))).toBe(false);expect(refresh).not.toHaveBeenCalled();expect(client.query).toHaveBeenCalledWith('ROLLBACK');
 });
 it('blocks viewers before opening a transaction',async()=>{
  const {response,connect}=await resetThroughRoute('holding_deposit',10,'viewer');expect(response.status).toBe(403);expect(connect).not.toHaveBeenCalled();
 });
 it('rejects stale links and allocations without identified participants',()=>{
  expect(()=>validateHoldingDepositReset([],[],[10])).toThrow('no longer linked');
  expect(()=>validateHoldingDepositReset([{id:90,kind:'holding_deposit'}],[],[10])).toThrow('another application');
  expect(()=>validateHoldingDepositReset([{id:90,kind:'holding_deposit'}],[{allocation_id:90,enquiry_id:null}],[10])).toThrow('another application');
 });
});
