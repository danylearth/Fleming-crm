import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
const mock=vi.hoisted(()=>({query:vi.fn(),refresh:vi.fn(),bank:{id:91,amount:131,currency:'GBP',match_status:'unmatched',description:'Test payment',booked_at:'2026-09-29'},allocated:false}));
vi.mock('./db-pg',()=>({default:{connect:async()=>({query:mock.query,release:()=>{}}),query:(...args:any[])=>mock.query(...args)},query:async(...args:any[])=>(await mock.query(...args)).rows,queryOne:async(...args:any[])=>(await mock.query(...args)).rows[0],run:async(...args:any[])=>mock.query(...args)}));
vi.mock('./auth',()=>({authMiddleware:(req:any,res:any,next:any)=>{const role=req.headers['x-test-role'];if(!role)return res.sendStatus(401);req.user={id:7,email:'staff@example.test',role};next();},requireFinance:(req:any,res:any,next:any)=>req.user.role==='admin'?next():res.sendStatus(403),requirePermission:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock('./holding-deposit-progress',async importOriginal=>({...await importOriginal<typeof import('./holding-deposit-progress')>(),refreshHoldingDeposit:mock.refresh}));
import {registerBankReconciliation} from './bank-reconciliation';
let server:Server,base:string;
const applicants=[{id:83,joint_partner_id:84,first_name_1:'Jamie',last_name_1:'Taylor',linked_property_id:26,holding_deposit_requested:1,holding_deposit_amount:131,status:'onboarding'},{id:84,joint_partner_id:83,first_name_1:'Casey',last_name_1:'Taylor',linked_property_id:26,holding_deposit_requested:1,holding_deposit_amount:131,status:'onboarding'}];
beforeEach(async()=>{
 mock.query.mockReset();mock.refresh.mockReset();mock.bank.match_status='unmatched';mock.allocated=false;
 mock.query.mockImplementation(async(sql:string,values:any[]=[])=>{
  if(sql.startsWith('SELECT id,joint_partner_id'))return {rows:[applicants.find(a=>a.id===values[0])].filter(Boolean)};
  if(sql.startsWith('SELECT * FROM tenant_enquiries'))return {rows:applicants};
  if(sql.startsWith('SELECT * FROM bank_feed_transactions'))return {rows:[mock.bank]};
  if(sql.startsWith('SELECT id,booked_at,description'))return {rows:[mock.bank,{...mock.bank,id:92,amount:999,description:'Unrelated Person'}]};
  if(/^SELECT id(?:,kind)? FROM bank_feed_allocations/.test(sql))return {rows:mock.allocated?[{id:3}]:[]};
  if(sql.startsWith('SELECT id,linked_property_id'))return {rows:[{id:values[0],property_id:26}]};
  if(sql.startsWith('INSERT INTO bank_feed_allocations('))return {rows:[{id:100}]};
  return {rows:[]};
 });
 const app=express();app.use(express.json());registerBankReconciliation(app);
 await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});
 base=`http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
const post=(path:string,body:any,role='viewer')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','x-test-role':role},body:JSON.stringify(body)});
describe('scoped holding deposit bank access',()=>{
 it('requires login and reveals only matching fields to a user without finance access',async()=>{
  expect((await fetch(base+'/api/tenant-enquiries/83/holding-deposit-payments')).status).toBe(401);
  const response=await fetch(base+'/api/tenant-enquiries/83/holding-deposit-payments',{headers:{'x-test-role':'viewer'}});
  expect(await response.json()).toEqual({matches:[{id:91,amount:131,booked_at:'2026-09-29',description:'Test payment',match_reason:'amount'}],linked:[]});
 });
 it('forces the holding deposit purpose and both applicants, ignoring forged allocations',async()=>{
  const response=await post('/api/tenant-enquiries/83/allocate-holding-deposit',{transaction_id:91,action:'ignore',allocations:[{kind:'expense',amount:999}]});
  expect(response.status).toBe(200);
  const inserted=mock.query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO bank_feed_allocations('));
  expect(inserted?.[1].slice(0,3)).toEqual([91,'holding_deposit',131]);
  expect(mock.query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO bank_feed_allocation_participants')).map(([,values])=>values)).toEqual([[100,null,83],[100,null,84]]);
  expect(mock.refresh).toHaveBeenCalledWith(expect.anything(),[83,84]);
  expect(mock.query).toHaveBeenCalledWith('COMMIT');
 });
 it('rechecks availability under lock and rolls back a stale selection',async()=>{
  mock.bank.match_status='matched_deposit';
  expect((await post('/api/tenant-enquiries/83/allocate-holding-deposit',{transaction_id:91})).status).toBe(400);
  expect(mock.query).toHaveBeenCalledWith('ROLLBACK');expect(mock.refresh).not.toHaveBeenCalled();
  expect(mock.query.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO bank_feed_allocations('))).toBe(false);
 });
 it('rejects a duplicate allocation even if the transaction status is stale',async()=>{
  mock.allocated=true;
  expect((await post('/api/tenant-enquiries/83/allocate-holding-deposit',{transaction_id:91})).status).toBe(400);
  expect(mock.refresh).not.toHaveBeenCalled();
 });
 it('keeps the full bank-feed allocation route restricted to finance users',async()=>{
  expect((await post('/api/bank-feed/transactions/91/reconcile',{action:'ignore'})).status).toBe(403);
 });
 it('also refreshes onboarding when an accounts user allocates from the bank feed',async()=>{
  expect((await post('/api/bank-feed/transactions/91/reconcile',{action:'assign',allocations:[{kind:'holding_deposit',amount:131,participants:[{enquiry_id:84}]}]},'admin')).status).toBe(200);
  expect(mock.refresh).toHaveBeenCalledWith(expect.anything(),[83,84]);
 });
});
