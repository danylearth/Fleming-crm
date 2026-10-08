vi.mock('./tenancy-changeover',()=>({applyDueTenancyChangeovers:vi.fn()}));
import {describe,it,expect,vi,beforeEach} from 'vitest';
const invoices=vi.hoisted(()=>({issueFinancialDocument:vi.fn(),rentInvoiceSource:vi.fn(),rentInvoiceSnapshot:vi.fn()}));
vi.mock('./financial-documents',()=>invoices);
const db=vi.hoisted(()=>({query:vi.fn(),release:vi.fn()}));
vi.mock('./db-pg',()=>({default:{connect:async()=>db}}));
vi.mock('./freeagent',()=>({syncFreeAgent:vi.fn()}));
import {runFinanceSchedule,scheduledRentCharges,nextRentDueDate} from './finance-scheduler';
beforeEach(()=>{Object.values(invoices).forEach(fn=>fn.mockReset());db.query.mockReset();db.query.mockImplementation(async(sql:string)=>{
 if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
 if(sql.includes('SELECT 1 FROM finance_daily_runs'))return {rowCount:1,rows:[]};
 if(sql.includes('SELECT cutover_date'))return {rows:[{cutover_date:'2026-09-21'}]};
 if(sql.includes('SELECT t.*'))return {rows:[{id:12,property_id:16,status:'active',tenancy_start_date:'2026-08-31',monthly_rent:875}]};
 return {rowCount:0,rows:[]};
});});
it('creates the current month charge before due day even after today’s finance sync ran',async()=>{
 await runFinanceSchedule(new Date('2026-09-29T10:00:00Z'));
 const insert=db.query.mock.calls.find(([sql])=>sql.includes('INSERT INTO rent_payments'));
 expect(insert?.[1]).toEqual([16,12,'2026-09-30',875,'Scheduled monthly rent charge']);
 expect(insert?.[0]).toContain("0,'pending'");expect(insert?.[0]).toContain('WHERE NOT EXISTS');
});
describe('final rental periods',()=>{
 it('marks the full final period and never starts another month on the end date',()=>{
  expect(scheduledRentCharges('2026-08-15','2026-12-31',15,'2026-10-15')).toEqual([{due:'2026-08-15',final:false},{due:'2026-09-15',final:true}]);
 });
 it('handles ending the day before billing and mid-period agreements',()=>{
  for(const end of ['2026-10-14','2026-10-02'])expect(scheduledRentCharges('2026-08-15','2026-12-31',15,end).at(-1)).toEqual({due:'2026-09-15',final:true});
 });
 it('handles month end and leap years without generating before tenancy start',()=>{
  expect(scheduledRentCharges('2028-01-31','2028-04-30',31,'2028-03-31')).toEqual([{due:'2028-01-31',final:false},{due:'2028-02-29',final:true}]);
  expect(scheduledRentCharges('2026-09-20','2026-09-30',15)).toEqual([]);
 });
 it('does not raise future months for an ongoing tenancy',()=>expect(scheduledRentCharges('2026-08-31','2026-09-30')).toEqual([{due:'2026-08-31',final:false},{due:'2026-09-30',final:false}]))
});

it('saves the existing current-month charge once, with the shared rent source key',async()=>{
 const previous=db.query.getMockImplementation()!;let saved=false;db.query.mockImplementation(async(sql:string)=>sql.includes('SELECT r.id FROM rent_payments')?{rows:saved?[]:[{id:37}]}:previous(sql));
 invoices.rentInvoiceSource.mockResolvedValue({id:37,tenant_id:18,landlord_id:1,property_id:10});invoices.rentInvoiceSnapshot.mockReturnValue({recipient:'Mathew Example & Zoe Example',amount:1100});invoices.issueFinancialDocument.mockImplementation(async()=>{saved=true;});
 await runFinanceSchedule(new Date('2026-09-29T10:00:00Z'));await runFinanceSchedule(new Date('2026-09-29T10:01:00Z'));
 expect(invoices.issueFinancialDocument).toHaveBeenCalledTimes(1);expect(invoices.issueFinancialDocument).toHaveBeenCalledWith('rent_invoice','rent:37',{recipient:'Mathew Example & Zoe Example',amount:1100},{tenant_id:18,landlord_id:1,property_id:10,rent_payment_id:37},{id:null,email:'system@scheduler'});
});

it('prepares only the next instalment across billing days and month ends',()=>{expect(nextRentDueDate('2026-09-29',5)).toBe('2026-10-05');expect(nextRentDueDate('2026-09-29',31)).toBe('2026-09-30');expect(nextRentDueDate('2026-09-05',5)).toBe('2026-09-05');expect(nextRentDueDate('2028-02-28',31)).toBe('2028-02-29');expect(nextRentDueDate('2026-12-30',5)).toBe('2027-01-05');});
