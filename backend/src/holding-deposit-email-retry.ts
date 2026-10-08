import type {PoolClient} from 'pg';
import {sendEmail, OUTBOUND_EMAIL_ADDRESS} from './email';

// The caller holds a transaction. Retry delivery only; never restart onboarding.
export async function retryHoldingDepositEmail(client:PoolClient, enquiryIds:number[], messageId:number, user:{id:number;email:string}) {
  const message=(await client.query(`SELECT * FROM email_messages WHERE id=$1 AND entity_type='tenant_enquiry' AND entity_id=ANY($2::int[]) AND template='holding_deposit_request' FOR UPDATE`,[messageId,enquiryIds])).rows[0];
  if(!message || message.status!=='failed') throw new Error('Only a failed holding deposit email can be retried. Refresh the delivery status.');
  const latest=(await client.query(`SELECT id FROM email_messages WHERE entity_type='tenant_enquiry' AND entity_id=$1 AND template='holding_deposit_request' ORDER BY created_at DESC,id DESC LIMIT 1`,[message.entity_id])).rows[0];
  if(latest?.id!==message.id) throw new Error('A newer sending attempt exists. Refresh the delivery status.');
  const recipient=(await client.query('SELECT email_1 FROM tenant_enquiries WHERE id=$1',[message.entity_id])).rows[0];
  if(!recipient?.email_1 || recipient.email_1.toLowerCase()!==message.to_email?.toLowerCase()) throw new Error('The recipient has changed. Review the email address before sending a new request.');
  if(!message.body_html || !message.subject) throw new Error('The original email is unavailable. Review the request before sending.');
  const result=await sendEmail({to:recipient.email_1,subject:message.subject,html:message.body_html,idempotencyKey:`holding-deposit-retry-${message.id}`});
  const status=result.simulated?'simulated':result.success?'sent':'failed';
  const retry=(await client.query(`INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,sent_by,sent_by_email,error_message) VALUES($1,'tenant_enquiry',$2,$3,$4,$5,'holding_deposit_request',$6,$7,$8,$9,$10) RETURNING id`,[result.id||null,message.entity_id,recipient.email_1,OUTBOUND_EMAIL_ADDRESS,message.subject,message.body_html,status,user.id,user.email,result.error||null])).rows[0];
  return {...result,status,messageId:retry.id,originalMessageId:message.id,recipient:recipient.email_1};
}
