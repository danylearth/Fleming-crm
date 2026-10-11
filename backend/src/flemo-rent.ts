import {query} from './db-pg';
import {matchFlemoRecords} from './flemo-lookup';

export function propertyRentQuestion(message:string){
 return /\brent\b/i.test(message)&&/\b(due|when|date|missing|payments?|arrears|overdue|outstanding)\b/i.test(message)
  &&!/\brent\s+reviews?\b|\breviews?\b.*\brent\b/i.test(message)
  &&!/\b(send|email|text|change|update|set|edit|create|schedule|cancel|delete|mark|all|every|portfolio|total)\b/i.test(message);
}
export function rentLookupText(message:string){
 return message.replace(/['’]s\b/g,'').replace(/\b(roads|streets|avenues|lanes|drives)\b/gi,word=>word.slice(0,-1))
  .replace(/\b(rent|rents|payments?|missing|unpaid|paid|arrears|overdue|outstanding|there|any|owing|owed|balance|monthly|month|day|does|have|has)\b/gi,' ');
}
const money=(value:unknown)=>Number(value||0).toLocaleString('en-GB',{style:'currency',currency:'GBP'});
const date=(value:string)=>new Date(value.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
const ordinal=(day:number)=>`${day}${day%100>=11&&day%100<=13?'th':({1:'st',2:'nd',3:'rd'}[day%10]||'th')}`;

// Routine property balances stay inside the CRM and do not depend on AI availability.
export async function fastRentAnswer(message:string,portfolio:string,context?:{entityType?:string;entityId?:number},financeAllowed=false){
 if(!financeAllowed||!propertyRentQuestion(message))return null;
 const properties=await query(`SELECT p.id,p.address AS name,p.postcode,'properties' AS entity
  FROM properties p LEFT JOIN landlords l ON l.id=p.landlord_id
  WHERE p.archived_at IS NULL AND ($1='all' OR l.landlord_type=$1)`,[portfolio]);
 const tenants=await query(`SELECT t.id,t.name,t.property_id,'tenants' AS entity
  FROM tenants t JOIN properties p ON p.id=t.property_id LEFT JOIN landlords l ON l.id=p.landlord_id
  WHERE t.status='active' AND p.archived_at IS NULL AND ($1='all' OR l.landlord_type=$1)`,[portfolio]);
 const matches=matchFlemoRecords([...properties,...tenants],rentLookupText(message),context);
 const ids=new Set(matches.map(r=>r.entity==='properties'?r.id:r.property_id));
 const selected=properties.filter(p=>ids.has(p.id));
 const actions=selected.slice(0,5).map(p=>({id:`properties-${p.id}`,type:'link',label:p.name,href:`/properties/${p.id}`}));
 if(!selected.length)return {text:'I couldn’t identify that property in your selected portfolio. Please give the full address or tenant name.',actions};
 if(selected.length>1)return {text:`Which property do you mean? ${selected.slice(0,5).map(p=>[p.name,p.postcode].filter(Boolean).join(', ')).join('; ')}.`,actions};
 const property=selected[0];
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());
 const occupants=await query(`SELECT t.id,t.name,
  COALESCE(t.rent_due_day,b.rent_due_day,EXTRACT(DAY FROM t.tenancy_start_date)::int) AS due_day,
  (t.rent_due_day IS NULL AND b.rent_due_day IS NULL) AS derived_from_start
  FROM tenants t LEFT JOIN LATERAL (SELECT rent_due_day FROM tenancy_billing_profiles
   WHERE property_id=t.property_id AND t.id=ANY(tenant_ids) AND start_date<=$2::date
   AND (end_date IS NULL OR end_date>=$2::date) ORDER BY start_date DESC,id DESC LIMIT 1) b ON TRUE
  WHERE t.property_id=$1 AND t.status='active' ORDER BY t.id`,[property.id,today]);
 const charges=await query(`SELECT r.id,r.due_date::text,r.amount_due,COALESCE(r.amount_paid,0) AS amount_paid,
  GREATEST(0,r.amount_due-COALESCE(r.amount_paid,0)) AS outstanding,t.name
  FROM rent_payments r LEFT JOIN tenants t ON t.id=r.tenant_id
  WHERE r.property_id=$1 AND r.due_date<=$2::date ORDER BY r.due_date,r.id`,[property.id,today]);
 const days=[...new Set(occupants.map(t=>Number(t.due_day)).filter(d=>Number.isInteger(d)&&d>=1&&d<=31))];
 const lines=[property.name];
 if(!occupants.length)lines.push('No active tenancy is recorded, so there is no current monthly rent due day to confirm.');
 else if(days.length===1&&occupants.every(t=>Number(t.due_day)===days[0])){
  lines.push(`Rent is due on the ${ordinal(days[0])} of each month${days[0]>28?' (or the last day of a shorter month)':''}.`);
  if(occupants.some(t=>t.derived_from_start))lines.push('The billing day is derived from the tenancy start date where no separate due day is saved.');
 }else lines.push('The current tenants’ rent due days are missing or inconsistent. Open the tenancy details to confirm them.');
 const unpaid=charges.filter(r=>Number(r.outstanding)>0.005);
 const overdue=unpaid.filter(r=>r.due_date<today),dueToday=unpaid.filter(r=>r.due_date===today);
 const sum=(rows:any[])=>rows.reduce((total,r)=>total+Number(r.outstanding),0);
 if(!charges.length)lines.push('No rent charges due on or before today are recorded for this property. I cannot confirm whether any payments are missing.');
 else{
  lines.push(overdue.length?`${overdue.length} recorded overdue charge${overdue.length===1?'':'s'}, with ${money(sum(overdue))} outstanding.`:'No overdue balance is recorded against this property’s saved rent charges.');
  if(dueToday.length)lines.push(`${money(sum(dueToday))} is due today and not yet recorded as paid; it is not overdue yet.`);
  for(const r of unpaid.slice(0,8))lines.push(`${date(r.due_date)}${r.name?' — '+r.name:''}: ${money(r.outstanding)} outstanding${Number(r.amount_paid)>0?' (part-paid)':''}.`);
  if(unpaid.length>8)lines.push(`${unpaid.length-8} further unpaid charges are included in the totals; open the property to review them.`);
  lines.push('These figures include saved charges from earlier tenancies at this property. Future charges are excluded.');
 }
 lines.push('Based on recorded CRM charges and payments, not a live bank balance; an unrecorded charge or receipt will not appear here.');
 return {text:lines.join('\n'),actions};
}
