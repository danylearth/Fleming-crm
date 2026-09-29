type Applicant={first_name_1?:string;last_name_1?:string;first_name_2?:string;last_name_2?:string;balance_due_amount?:unknown;balance_bank_amount?:unknown;balance_manual_amount?:unknown};
type BankPayment={amount:unknown;description?:string;display_name?:string;merchant_name?:string};
const words=(text:string)=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
export function finalBalanceMatch(payment:BankPayment,applicants:Applicant[]):'amount'|'name'|null {
 const cents=Math.round(Number(payment.amount)*100);if(!Number.isFinite(cents)||cents<=0)return null;
 if(applicants.some(e=>{const due=Math.round(Number(e.balance_due_amount||0)*100),paid=Math.max(Number(e.balance_bank_amount||0),Number(e.balance_manual_amount||0));return cents===due||cents===Math.round((Number(e.balance_due_amount||0)-paid)*100);}))return 'amount';
 const text=new Set(words([payment.description,payment.display_name,payment.merchant_name].filter(Boolean).join(' ')));
 for(const e of applicants)for(const [first,last] of [[e.first_name_1,e.last_name_1],[e.first_name_2,e.last_name_2]]){
  if(!first?.trim()||!last?.trim())continue;
  const tokens=words(`${first} ${last}`);if(tokens.length>=2&&tokens.every(token=>text.has(token)))return 'name';
 }
 return null;
}
