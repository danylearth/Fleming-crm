export function rentInvoiceDates(dueDate:string,paymentDay?:number){
 const due=new Date(String(dueDate).slice(0,10)+'T12:00:00Z');if(!Number.isFinite(due.getTime()))throw Error('Invalid rent due date');
 const day=paymentDay||due.getUTCDate();const month=(offset:number)=>{const d=new Date(Date.UTC(due.getUTCFullYear(),due.getUTCMonth()+offset,1,12));d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d;};
 const end=month(1);end.setUTCDate(end.getUTCDate()-1);
 return {due_date:due.toISOString().slice(0,10),period_start:due.toISOString().slice(0,10),period_end:end.toISOString().slice(0,10)};
}
export function rentPaymentReference(address:string,postcode:string,lastName:string){return `${String(address||'').match(/^\s*\d+[A-Za-z]?/)?.[0]?.trim()||'PROPERTY'} ${String(postcode||'').replace(/\s/g,'').toUpperCase()} - ${String(lastName||'TENANT').toUpperCase()}`;}
export function rentPropertyAddress(address:string,postcode:string){return postcode&&!address.replace(/\s/g,'').toUpperCase().endsWith(postcode.replace(/\s/g,'').toUpperCase())?[address,postcode].filter(Boolean).join(', '):address;}
