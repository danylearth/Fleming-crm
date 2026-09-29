type Payer={description?:string;display_name?:string;merchant_name?:string};
type History=Payer&{tenant_id:number|string;property_id:number|string;created_by:number|null;reversed_at?:string|null};
type Charge={id:number|string;tenant_id:number|string;property_id:number|string;tenant_name:string;address:string;due_date:string|Date;amount_due:number|string;amount_paid:number|string;landlord_type:string};
const normalise=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function references(p:Payer){
 return [p.description,p.display_name,p.merchant_name].filter((s):s is string=>!!s).map(normalise).filter(s=>s.length>=4&&/[a-z]{3}/.test(s)&&!/^((rent|payment|transfer|bgc|fpi|bacs|fp)\s*)+$/.test(s));
}
const payerWords=(s:string)=>[...new Set(s.split(' ').filter(w=>!/^(rent|payment|transfer|bgc|fpi|bacs|fp|faster|standing|order|so|\d+)$/.test(w)))].sort().join(' ');
export function suggestRentMatches(payment:Payer&{amount:number|string;currency:string;match_status:string},history:History[],charges:Charge[]){
 if(payment.currency!=='GBP'||Number(payment.amount)<=0||payment.match_status!=='unmatched')return [];
 const refs=references(payment);
 return charges.flatMap(charge=>{
  const previous=history.filter(h=>h.created_by&&!h.reversed_at&&String(h.tenant_id)===String(charge.tenant_id)&&String(h.property_id)===String(charge.property_id));
  let reason='';
  for(const h of previous){const old=references(h);if(refs.some(r=>old.includes(r))){reason='Same payer reference as a previously confirmed rent payment';break;}
   if(refs.some(r=>payerWords(r).length>=4&&old.some(o=>payerWords(o)===payerWords(r))))reason='Similar payer name to a previously confirmed rent payment';
  }
  if(!reason)return [];
  const outstanding=Math.max(0,Number(charge.amount_due)-Number(charge.amount_paid||0));
  return [{rent_payment_id:Number(charge.id),tenant_name:charge.tenant_name,address:charge.address,due_date:charge.due_date instanceof Date?charge.due_date.toISOString().slice(0,10):charge.due_date.slice(0,10),outstanding,kind:charge.landlord_type==='internal'?'rent':'client_rent',reason,amount_matches:Math.abs(Number(payment.amount)-outstanding)<0.005}];
 }).sort((a,b)=>Number(b.amount_matches)-Number(a.amount_matches)||a.due_date.localeCompare(b.due_date)||a.rent_payment_id-b.rent_payment_id).slice(0,8);
}
