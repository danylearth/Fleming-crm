import {describe,it,expect} from 'vitest';
import {allocationInPortfolio,portfolioDepositTotals,portfolioRentTotals} from './portfolioFinance';
const scope={property:(id:number)=>id===1,tenant:(id:number)=>id===10,enquiry:(id:number)=>id===20};
describe('portfolio financial records',()=>{
 it('uses linked ownership and excludes unassigned allocations',()=>{
  expect(allocationInPortfolio({kind:'rent',amount:100,property_id:1},scope)).toBe(true);
  expect(allocationInPortfolio({kind:'rent',amount:100,property_id:2,tenant_id:10},scope)).toBe(false);
  expect(allocationInPortfolio({kind:'holding_deposit',amount:100,participants:[{enquiry_id:20}]},scope)).toBe(true);
  expect(allocationInPortfolio({kind:'rent',amount:100},scope)).toBe(false);
 });
 it('counts only the selected portfolio allocations once even on split payments',()=>{
  expect(portfolioDepositTotals([{amount:400,allocations:[{kind:'deposit',amount:200,property_id:1},{kind:'deposit',amount:200,property_id:2}]},{amount:-50,allocations:[{kind:'deposit',amount:50,property_id:1}]}],a=>allocationInPortfolio(a,scope))).toEqual({security:150,holding:0});
 });
 it('counts joint tenancy rent once and uses only the selected month payments',()=>{
  expect(portfolioRentTotals([{id:10,property_id:1,monthly_rent:1000},{id:11,property_id:1,monthly_rent:1000}],[],[{due_date:'2026-10-01',amount_due:1000,amount_paid:600},{due_date:'2026-09-01',amount_due:1000,amount_paid:1000}],'2026-10')).toEqual({monthly_rent:1000,active_tenancies:1,collected:600,outstanding:400});
 });
});
