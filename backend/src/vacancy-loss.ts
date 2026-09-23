// Only count evidenced gaps after a tenancy ends. Onboarding/creation dates do
// not prove a property was empty, and joint tenants must not duplicate a gap.
export type VacancyProperty={id:number;address:string;rent_amount?:number|string;archived_at?:string|null;status?:string};
export type VacancyTenant={property_id:number;tenancy_start_date:string|null;tenancy_end_date:string|null;monthly_rent?:number|string|null;status:string;has_end_date?:number};
export type VacancyExpense={property_id:number;amount:number|string;category:string;expense_date:string|null;coverage_start?:string|null;coverage_end?:string|null;is_estimate?:boolean;excluded_from_costs?:boolean};
const day=86400000;
const timestamp=(value?:string|null)=>value&&/^\d{4}-\d{2}-\d{2}/.test(value)?Date.parse(value.slice(0,10)+'T00:00:00Z'):NaN;
const iso=(value:number)=>new Date(value).toISOString().slice(0,10);
const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export function vacancyLoss(properties:VacancyProperty[],tenants:VacancyTenant[],expenses:VacancyExpense[],today:string){
 const until=timestamp(today)+day;
 const periods:{property_id:number;address:string;from:string;through:string;days:number;rent:number;costs:number;total:number}[]=[];
 const missing_dates:{property_id:number;address:string}[]=[];
 for(const p of properties.filter(p=>!p.archived_at)){
  const rows=tenants.filter(t=>t.property_id===p.id);
  const intervals=rows.filter(t=>Number.isFinite(timestamp(t.tenancy_start_date))).map(t=>({start:timestamp(t.tenancy_start_date),end:t.tenancy_end_date&&(t.has_end_date===1||t.status==='inactive')?timestamp(t.tenancy_end_date)+day:Infinity,rent:Number(t.monthly_rent)||Number(p.rent_amount)||0})).filter(t=>t.end>=t.start).sort((a,b)=>a.start-b.start);
  const merged:typeof intervals=[];
  for(const current of intervals){const previous=merged[merged.length-1];if(previous&&current.start<=previous.end){previous.end=Math.max(previous.end,current.end);previous.rent=Math.max(previous.rent,current.rent);}else merged.push({...current});}
  if((!merged.length||rows.some(t=>t.status==='inactive'&&!t.tenancy_end_date))&&!rows.some(t=>t.status==='active'))missing_dates.push({property_id:p.id,address:p.address});
  for(let i=0;i<merged.length;i++){
   const from=merged[i].end,to=Math.min(merged[i+1]?.start??until,until);
   if(!Number.isFinite(from)||to<=from)continue;
   const monthly=merged[i+1]?.rent||Number(p.rent_amount)||merged[i].rent;
   let rent=0;
   for(let date=from;date<to;){const d=new Date(date),nextMonth=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1),end=Math.min(nextMonth,to),daysInMonth=new Date(nextMonth-day).getUTCDate();rent+=monthly*((end-date)/day)/daysInMonth;date=end;}
   let costs=0;
   for(const e of expenses.filter(e=>e.property_id===p.id&&!e.is_estimate&&!e.excluded_from_costs)){
    const category=e.category.toLowerCase().replace(/[ _-]+/g,' ').trim();
    if(!['marketing','marketing costs','council tax','utilities','utility','gas','electricity','water','gas and electricity'].includes(category))continue;
    const amount=Number(e.amount);if(!Number.isFinite(amount)||amount<0)continue;
    const start=timestamp(e.coverage_start),end=timestamp(e.coverage_end)+day;
    if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)costs+=amount*Math.max(0,Math.min(to,end)-Math.max(from,start))/(end-start);
    else {const date=timestamp(e.expense_date);if(date>=from&&date<to)costs+=amount;}
   }
   periods.push({property_id:p.id,address:p.address,from:iso(from),through:iso(to-day),days:(to-from)/day,rent:money(rent),costs:money(costs),total:money(money(rent)+money(costs))});
  }
 }
 return {total:money(periods.reduce((n,p)=>n+p.total,0)),periods,missing_dates};
}
