export interface MarketingContact {entity_type:string;id:number;name:string;email:string;phone:string;audience:string;email_allowed:boolean;sms_allowed:boolean}
export function groupMarketingContacts(contacts:MarketingContact[],channel:string){
 const groups=new Map<string,MarketingContact&{recipientKey:string;recordKeys:string[];audiences:string[]}>();
 for(const c of contacts){
  let destination=channel==='email'?(c.email||'').trim().toLowerCase():(c.phone||'').replace(/[\s().-]/g,'');
  if(channel==='sms'){if(destination.startsWith('00'))destination='+'+destination.slice(2);if(destination.startsWith('0'))destination='+44'+destination.slice(1);else if(destination.startsWith('44'))destination='+'+destination;}
  const recordKey=`${c.entity_type}:${c.id}`,recipientKey=destination?`${channel}:${destination}`:recordKey;
  const existing=groups.get(recipientKey);
  if(existing){existing.recordKeys.push(recordKey);if(!existing.audiences.includes(c.audience))existing.audiences.push(c.audience);existing.email_allowed=existing.email_allowed&&c.email_allowed;existing.sms_allowed=existing.sms_allowed&&c.sms_allowed;}
  else groups.set(recipientKey,{...c,recipientKey,recordKeys:[recordKey],audiences:[c.audience]});
 }
 return [...groups.values()];
}
