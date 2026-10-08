import {beforeEach,expect,it,vi} from 'vitest';
const send=vi.hoisted(()=>vi.fn());
vi.mock('./email',()=>({sendEmail:send,OUTBOUND_EMAIL_ADDRESS:'enquiries@example.test'}));
import {retryHoldingDepositEmail} from './holding-deposit-email-retry';
function fixture(){
 const message:any={id:12,entity_id:91,status:'failed',to_email:'sam@example.test',subject:'Holding deposit request',body_html:'<p>Original application link</p>'};
 const writes:any[]=[];let latest=12;const recipient={email_1:'sam@example.test'};
 const client={query:async(sql:string,args:any[])=>{
  if(sql.startsWith('SELECT * FROM email_messages'))return {rows:args[1].includes(message.entity_id)?[message]:[]};
  if(sql.startsWith('SELECT id FROM email_messages'))return {rows:[{id:latest}]};
  if(sql.startsWith('SELECT email_1'))return {rows:[recipient]};
  if(sql.startsWith('INSERT INTO email_messages')){writes.push(args);latest=13;return {rows:[{id:13}]};}
  throw Error('Unexpected workflow mutation: '+sql);
 }};
 return {message,recipient,writes,client:client as any,newer:()=>latest=14};
}
beforeEach(()=>send.mockReset().mockResolvedValue({success:true,id:'provider-1'}));
it('retries only the failed recipient, uses the corrected sender, and preserves the original failure and onboarding',async()=>{
 const f=fixture();const result=await retryHoldingDepositEmail(f.client,[91,92],12,{id:1,email:'office@example.test'});
 expect(result.status).toBe('sent');expect(send).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledWith({to:'sam@example.test',subject:f.message.subject,html:f.message.body_html,idempotencyKey:'holding-deposit-retry-12'});
 expect(f.message.status).toBe('failed');expect(f.writes[0][3]).toBe('enquiries@example.test');
 await expect(retryHoldingDepositEmail(f.client,[91,92],12,{id:1,email:'office@example.test'})).rejects.toThrow('newer');expect(send).toHaveBeenCalledTimes(1);
});
it('records another failure accurately when the provider still rejects it',async()=>{send.mockResolvedValue({success:false,error:'Provider rejected'});const f=fixture();const result=await retryHoldingDepositEmail(f.client,[91],12,{id:1,email:'office@example.test'});expect(result.status).toBe('failed');expect(result.error).toBe('Provider rejected');expect(f.writes[0][6]).toBe('failed');});
it('rejects unrelated records, newer attempts, already successful emails and changed recipients',async()=>{
 for(const kind of ['unrelated','newer','sent','changed']){const f=fixture();if(kind==='newer')f.newer();if(kind==='sent')f.message.status='sent';if(kind==='changed')f.recipient.email_1='other@example.test';await expect(retryHoldingDepositEmail(f.client,kind==='unrelated'?[92]:[91],12,{id:1,email:'office@example.test'})).rejects.toThrow();}
 expect(send).not.toHaveBeenCalled();
});
