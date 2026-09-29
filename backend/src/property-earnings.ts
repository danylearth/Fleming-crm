import {query} from './db-pg';

type Receipt={property_id:number;address:string;service_type:string;kind:'setup'|'rent';amount:number|string;rate:number|string|null;fixed_fee?:number|string|null};
export function summariseEarnings(receipts:Receipt[]) {
 const totals=new Map<number,{property_id:number;address:string;client_rent:number;letting_fees:number;ongoing_fees:number;total:number;missing_rates:number}>();
 for(const r of receipts){
  const row=totals.get(r.property_id)||{property_id:r.property_id,address:r.address,client_rent:0,letting_fees:0,ongoing_fees:0,total:0,missing_rates:0};
  const amount=Math.max(0,Number(r.amount)||0);
  if(r.kind==='rent')row.client_rent+=Math.round(amount*100);
  if(r.kind==='setup'||['rent_collection','full_management'].includes(r.service_type)){
   const fixed=r.kind==='setup'&&r.fixed_fee!=null?Number(r.fixed_fee):null;
   const rate=r.rate==null?null:Number(r.rate);
   if(fixed!=null&&Number.isFinite(fixed)&&fixed>=0)row.letting_fees+=Math.round(fixed*100);
   else if(rate!=null&&Number.isFinite(rate)&&rate>=0&&rate<=100){const fee=Math.round(amount*rate);if(r.kind==='setup')row.letting_fees+=fee;else row.ongoing_fees+=fee;}
   else if(amount>0)row.missing_rates++;
  }
  totals.set(r.property_id,row);
 }
 return [...totals.values()].map(r=>({...r,client_rent:r.client_rent/100,letting_fees:r.letting_fees/100,ongoing_fees:r.ongoing_fees/100,total:(r.letting_fees+r.ongoing_fees)/100}));
}

// Historical contract snapshots are used, never today's editable property rates.
// Opening balances represent assumed payments and are not confirmed receipts.
export async function propertyEarnings(propertyId?:number){
 const rows=await query(`WITH setup AS (
  SELECT DISTINCT ON (p.id,LEAST(e.id,COALESCE(e.joint_partner_id,e.id)))
   p.id property_id,p.address,COALESCE(a.agreement_details->>'serviceType',s.service_type,p.service_type) service_type,
   'setup' kind,COALESCE((a.agreement_details->>'rent')::numeric,e.monthly_rent_agreed,0) amount,
   COALESCE((a.agreement_details->>'serviceSetupFee')::numeric,s.setup_fee) rate,
   (a.agreement_details->>'letOnlyFee')::numeric fixed_fee
  FROM properties p JOIN landlords l ON l.id=p.landlord_id
  JOIN tenant_enquiries e ON e.linked_property_id=p.id
  JOIN LATERAL (SELECT * FROM tenancy_agreements ta WHERE ta.property_id=p.id AND ta.enquiry_id IN(e.id,e.joint_partner_id) AND ta.status='completed' ORDER BY ta.issued_at DESC,ta.id DESC LIMIT 1) a ON true
  LEFT JOIN LATERAL (SELECT * FROM landlord_service_agreements sa WHERE sa.property_id=p.id AND sa.signed_at IS NOT NULL AND sa.signed_at<=a.issued_at ORDER BY sa.signed_at DESC,sa.id DESC LIMIT 1) s ON true
  WHERE l.landlord_type='external' AND e.balance_payment_received=1 AND ($1::int IS NULL OR p.id=$1)
  ORDER BY p.id,LEAST(e.id,COALESCE(e.joint_partner_id,e.id)),a.issued_at DESC,e.id
 ), receipts AS (
  SELECT p.id property_id,p.address,COALESCE(s.service_type,p.service_type) service_type,
   'rent' kind,GREATEST(0,COALESCE(r.amount_paid,0)-COALESCE(r.opening_balance_amount,0)) amount,s.monthly_fee rate,NULL::numeric fixed_fee
  FROM rent_payments r JOIN properties p ON p.id=r.property_id JOIN landlords l ON l.id=p.landlord_id
  LEFT JOIN LATERAL (SELECT * FROM landlord_service_agreements sa WHERE sa.property_id=p.id AND sa.signed_at IS NOT NULL AND sa.signed_at::date<=r.due_date ORDER BY sa.signed_at DESC,sa.id DESC LIMIT 1) s ON true
  WHERE l.landlord_type='external' AND r.payment_date<=CURRENT_DATE AND COALESCE(r.amount_paid,0)>COALESCE(r.opening_balance_amount,0) AND ($1::int IS NULL OR p.id=$1)
 ) SELECT * FROM setup UNION ALL SELECT * FROM receipts`,[propertyId??null]);
 return summariseEarnings(rows);
}

export function rentDueToLandlord(rent:number, fees:number, remitted:number, missingRates:number) {
 return missingRates ? null : Math.max(0,Math.round((rent-fees-remitted)*100)/100);
}
export async function clientEarningsOverview(){
 const earnings=await propertyEarnings();
 const properties=await query(`SELECT p.id property_id,p.address,p.postcode,p.service_type,
   COALESCE((SELECT json_agg(json_build_object('id',ll.id,'name',ll.name) ORDER BY ll.name)
     FROM landlords ll WHERE ll.id=p.landlord_id OR EXISTS(SELECT 1 FROM property_landlords pl WHERE pl.property_id=p.id AND pl.landlord_id=ll.id)),'[]'::json) landlords,
   COALESCE((SELECT json_agg(json_build_object('id',t.id,'name',t.name) ORDER BY t.name) FROM tenants t WHERE t.property_id=p.id AND COALESCE(t.status,'active')='active'),'[]'::json) tenants,
   COALESCE((SELECT SUM(a.amount*SIGN(b.amount)) FROM bank_feed_allocations a JOIN bank_feed_transactions b ON b.id=a.bank_transaction_id WHERE a.property_id=p.id AND a.kind='holding_deposit' AND a.reversed_at IS NULL),0) holding_deposits,
   COALESCE((SELECT json_agg(json_build_object('id',a.id,'amount',a.amount,'paid_at',b.booked_at) ORDER BY b.booked_at DESC,a.id DESC) FROM bank_feed_allocations a JOIN bank_feed_transactions b ON b.id=a.bank_transaction_id WHERE a.property_id=p.id AND a.kind='financial' AND a.category='Landlord Rent Remittance' AND b.amount<0 AND a.reversed_at IS NULL),'[]'::json) remittances
   FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE l.landlord_type='external' ORDER BY p.address,p.id`);
 const byId=new Map(earnings.map(row=>[Number(row.property_id),row]));
 return properties.map(p=>{
  const row=byId.get(Number(p.property_id))||{client_rent:0,letting_fees:0,ongoing_fees:0,total:0,missing_rates:0};
  const remitted=p.remittances.reduce((sum:number,r:any)=>sum+Math.round(Number(r.amount)*100),0)/100;
  return {...p,...row,holding_deposits:Number(p.holding_deposits),remitted,last_remitted_at:p.remittances[0]?.paid_at||null,due_to_landlord:rentDueToLandlord(row.client_rent,row.ongoing_fees,remitted,row.missing_rates)};
 });
}
