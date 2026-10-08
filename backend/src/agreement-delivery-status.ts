type Delivery={id:number;body_html:string;status:string;error_message?:string;to_email?:string};
export function agreementDeliveryStatus(parties:{key:string;slug?:string}[],messages:Delivery[]){
 const result:Record<string,{status:string;label:string;email?:string}>={};
 for(const party of parties){
  if(!party.slug)continue;
  const escaped=party.slug.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const link=new RegExp('/'+escaped+'(?:["\'?#<\\s]|$)');
  const latest=messages.filter(m=>link.test(m.body_html||'')).sort((a,b)=>Number(b.id)-Number(a.id))[0];
  if(!latest||!['bounced','failed','suppressed'].includes(latest.status))continue;
  const invalid=latest.status==='bounced'||latest.status==='suppressed'||/invalid.*(email|recipient|address)|(email|recipient|address).*invalid|mailbox.*(unavailable|not found)|no such user|recipient.*(rejected|not found)|not a valid email|bounce|suppressed/i.test(latest.error_message||'');
  result[party.key]={status:invalid?'invalid_email':'failed',label:invalid?'Invalid email - please update and resend':'Email failed - please retry',email:latest.to_email};
 }
 return result;
}
