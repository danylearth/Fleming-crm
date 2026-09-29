import {describe,it,expect} from 'vitest';
import {finalBalanceProgress,validateFinalBalance,refreshFinalBalance} from './final-balance-progress';
describe('final balance bank tracking',()=>{
 it('keeps partial payments pending and unlocks at the full amount',()=>{
  expect(finalBalanceProgress(1769,0,1000)).toEqual({received:1000,remaining:769,complete:false});
  expect(finalBalanceProgress(1769,0,1769)).toEqual({received:1769,remaining:0,complete:true});
 });
 it('does not double count manual receipts or lose them on unallocation',()=>{
  expect(finalBalanceProgress(1769,1769,1769).received).toBe(1769);
  expect(finalBalanceProgress(1769,1769,0).complete).toBe(true);
  expect(finalBalanceProgress(1769,0,0).complete).toBe(false);
 });
 it('requires the latest agreement to be completed',async()=>{
  const client={query:async(sql:string)=>({rows:sql.includes('FROM tenant_enquiries')?[{balance_payment_requested:1,balance_due_amount:1769,status:'onboarding'}]:[{status:'sent'}]})};
  await expect(validateFinalBalance(client,[1])).rejects.toThrow('current agreement');
 });
 it('counts a joint allocation once and reverses completion when funds are unassigned',async()=>{
  const writes:{sql:string;values:any[]}[]=[];
  const client={query:async(sql:string,values:any[]=[])=>{
   if(sql.startsWith('SELECT *'))return {rows:[1,2].map(id=>({id,balance_due_amount:1769,balance_manual_amount:0}))};
   if(sql.startsWith('SELECT COALESCE')){expect(sql).toContain('EXISTS(');return {rows:[{amount:1000,received_date:'2026-09-27'}]};}
   writes.push({sql,values});return {rows:[]};
  }};
  await refreshFinalBalance(client,[1,2]);
  const updates=writes.filter(w=>w.sql.startsWith('UPDATE tenant_enquiries'));
  expect(updates).toHaveLength(2);for(const update of updates)expect(update.values.slice(0,4)).toEqual([1000,'2026-09-27',0,null]);
 });
});
