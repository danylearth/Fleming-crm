import type { PortfolioRecord } from './dashboardPortfolio';

type Allocation = { property_id?: number; tenant_id?: number; participants?: {tenant_id?:number;enquiry_id?:number}[]; kind:string;category?:string;amount:number };
export function allocationInPortfolio(allocation:Allocation, scope:{property:(id:number)=>boolean;tenant:(id:number)=>boolean;enquiry:(id:number)=>boolean}) {
  if (allocation.property_id) return scope.property(allocation.property_id);
  if (allocation.tenant_id) return scope.tenant(allocation.tenant_id);
  return !!allocation.participants?.length && allocation.participants.every(p=>p.tenant_id?scope.tenant(p.tenant_id):p.enquiry_id?scope.enquiry(p.enquiry_id):false);
}
export function portfolioDepositTotals(rows:{amount:number;allocations?:Allocation[]}[], matches:(a:Allocation)=>boolean) {
  let security=0,holding=0;
  for(const row of rows)for(const a of row.allocations||[]){
    if(!matches(a))continue;
    const cents=Math.sign(Number(row.amount))*Math.round(Number(a.amount)*100);
    if(a.kind==='holding_deposit')holding+=cents;
    else if(a.kind==='deposit'||['Security Deposit Payments In','Security Deposit Payments Out'].includes(a.category||''))security+=cents;
  }
  return {security:security/100,holding:holding/100};
}
export function portfolioRentTotals(tenants:PortfolioRecord[],properties:PortfolioRecord[],payments:{due_date?:string;amount_due:number|string;amount_paid?:number|string}[], month:string) {
  const rents=new Map<number,number>();
  for(const t of tenants)if(t.property_id&&(t.status||'active')==='active'){
    const rent=Number(t.monthly_rent??properties.find(p=>p.id===t.property_id)?.rent_amount??0);
    rents.set(t.property_id,Math.max(rents.get(t.property_id)||0,rent));
  }
  const current=payments.filter(p=>p.due_date?.slice(0,7)===month);
  return {monthly_rent:[...rents.values()].reduce((sum,n)=>sum+n,0),active_tenancies:rents.size,collected:current.reduce((sum,p)=>sum+Number(p.amount_paid||0),0),outstanding:current.reduce((sum,p)=>sum+Math.max(0,Number(p.amount_due)-Number(p.amount_paid||0)),0)};
}
