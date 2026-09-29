import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({sql:vi.fn(),connect:vi.fn(),bank:{id:10,amount:-900,currency:'GBP',match_status:'unmatched',booked_at:'2026-09-26'},owner:'external'}));
vi.mock('./db-pg',()=>({default:{connect:mock.connect},query:vi.fn(),queryOne:vi.fn(),run:vi.fn()}));
vi.mock('./auth',()=>({authMiddleware:vi.fn(),requireFinance:vi.fn(),requirePermission:()=>vi.fn()}));
import {registerBankReconciliation} from './bank-reconciliation';
const handlers=new Map<string,any>();registerBankReconciliation({get:vi.fn(),patch:vi.fn(),post:(path:string,...h:any[])=>handlers.set(path,h.at(-1))} as any);
beforeEach(()=>{vi.clearAllMocks();mock.bank.amount=-900;mock.owner='external';mock.connect.mockResolvedValue({query:mock.sql,release:vi.fn()});mock.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT * FROM bank_feed_transactions')?[mock.bank]:sql.startsWith('SELECT id FROM properties')?[{id:1}]:sql.startsWith('SELECT l.landlord_type')?[{landlord_type:mock.owner}]:sql.startsWith('INSERT INTO bank_feed_allocations')?[{id:20}]:[]}));});
const call=async(property_id:any=1)=>{const res:any={code:200,status(n:number){this.code=n;return this;},json:vi.fn()};await handlers.get('/api/bank-feed/transactions/:id/reconcile')({params:{id:'10'},user:{id:1,email:'office@example.test'},body:{action:'assign',allocations:[{kind:'financial',category:'Landlord Rent Remittance',property_id,amount:900}]}},res);return res;};
it('records outgoing landlord allocations without treating client money as a business expense',async()=>{const res=await call();expect(res.code).toBe(200);expect(mock.sql.mock.calls.some(([s])=>s.startsWith('INSERT INTO bank_feed_allocations'))).toBe(true);expect(mock.sql.mock.calls.some(([s])=>s.startsWith('INSERT INTO property_expenses'))).toBe(false);expect(mock.sql).toHaveBeenCalledWith('COMMIT');});
it('rejects incoming transfers',async()=>{mock.bank.amount=900;expect((await call()).code).toBe(400);expect(mock.sql).toHaveBeenCalledWith('ROLLBACK');});
it('requires an external landlord property',async()=>{expect((await call(null)).code).toBe(400);mock.owner='internal';expect((await call()).code).toBe(400);});
it.each([undefined,false,'true'])('requires explicit user confirmation before writing a rent allocation (%s)',async(confirm)=>{
 mock.bank.amount=900;const res:any={code:200,status(n:number){this.code=n;return this;},json:vi.fn()};
 await handlers.get('/api/bank-feed/transactions/:id/reconcile')({params:{id:'10'},user:{id:1,email:'office@example.test'},body:{action:'assign',confirm_rent_assignment:confirm,allocations:[{kind:'rent',rent_payment_id:1,amount:900}]}},res);
 expect(res.code).toBe(400);expect(res.json).toHaveBeenCalledWith({error:'Confirm the rent allocation before saving'});expect(mock.sql).toHaveBeenCalledWith('ROLLBACK');expect(mock.sql.mock.calls.some(([s])=>/^(INSERT|UPDATE)/.test(s))).toBe(false);
});
it('assigns a rent payment only after confirmation and records the user in its audit',async()=>{
 mock.bank.amount=900;const original=mock.sql.getMockImplementation()!;mock.sql.mockImplementation(async(sql:string,args?:unknown[])=>{
  if(sql.startsWith('SELECT * FROM rent_payments'))return {rows:[{id:1,property_id:2,tenant_id:3,amount_due:900,amount_paid:0,bank_base_paid:0,bank_base_opening:0}]};
  if(sql.startsWith('SELECT COUNT(*)'))return {rows:[{n:1,total:900,paid_date:'2026-09-26'}]};
  return original(sql,args);
 });
 const res:any={code:200,status(n:number){this.code=n;return this;},json:vi.fn()};
 await handlers.get('/api/bank-feed/transactions/:id/reconcile')({params:{id:'10'},user:{id:7,email:'reviewer@example.test'},body:{action:'assign',confirm_rent_assignment:true,allocations:[{kind:'rent',rent_payment_id:1,amount:900}]}},res);
 expect(res.code).toBe(200);expect(mock.sql).toHaveBeenCalledWith('COMMIT');const audit=mock.sql.mock.calls.find(([s])=>s.startsWith('INSERT INTO audit_log'));expect(audit?.[1].slice(0,2)).toEqual([7,'reviewer@example.test']);expect(JSON.parse(audit?.[1][3]).confirm_rent_assignment).toBe(true);
});
