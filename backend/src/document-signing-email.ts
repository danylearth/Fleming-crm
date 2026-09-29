import type {PoolClient} from 'pg';
import pool from './db-pg';
import {completedDocumentEmail,normalizePropertyAddress,sendEmail,OUTBOUND_EMAIL_ADDRESS} from './email';

export async function queueCompletedDocumentEmails(client:PoolClient,request:any,recipients:any[]){
 if(!recipients.length||recipients.some(r=>!r.signed_at))throw Error('All recipients must sign before completion emails are queued');
 // A landlord record can cover several properties. Never guess which property applies.
 const property=request.entity_type==='tenant'?(await client.query('SELECT p.address,p.postcode FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.id=$1',[request.entity_id])).rows[0]:null;
 const address=property?normalizePropertyAddress(property.address,property.postcode):'';
 for(const r of recipients){
  const email=completedDocumentEmail(r.name,request.title,r.signed_at,address);
  await client.query(`INSERT INTO signature_completion_emails(recipient_id,to_email,subject,body_html) VALUES($1,$2,$3,$4) ON CONFLICT(recipient_id) DO NOTHING`,[r.id,r.email,email.subject,email.html]);
 }
}

// Durable queue: delivery happens after signing commits and can resume after a restart.
// Lock each row during delivery so concurrent workers cannot send the same copy.
export async function deliverCompletedDocumentEmails(requestId?:number){
 let sent=0;
 for(let i=0;i<25;i++){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   // Keep retries within the provider's idempotency window; failures stay visible.
   await client.query(`UPDATE signature_completion_emails SET status='failed',last_error='Automatic retry window ended; check email delivery before resending' WHERE status='pending' AND (attempts>=6 OR created_at<NOW()-INTERVAL '23 hours')`);
   const row=(await client.query(`SELECT e.*,r.request_id,r.entity_type,r.entity_id,s.title,s.signed_pdf FROM signature_completion_emails e JOIN signature_recipients r ON r.id=e.recipient_id JOIN signature_requests s ON s.id=r.request_id WHERE e.status='pending' AND e.next_attempt_at<=NOW() AND s.status='completed' AND s.signed_pdf IS NOT NULL AND NOT EXISTS(SELECT 1 FROM signature_recipients other WHERE other.request_id=s.id AND other.signed_at IS NULL) AND ($1::bigint IS NULL OR s.id=$1) ORDER BY e.created_at,e.recipient_id LIMIT 1 FOR UPDATE OF e SKIP LOCKED`,[requestId??null])).rows[0];
   if(!row){await client.query('COMMIT');break;}
   let result:Awaited<ReturnType<typeof sendEmail>>;
   try{result=await sendEmail({to:row.to_email,subject:row.subject,html:row.body_html,idempotencyKey:`signed-document-${row.request_id}-${row.recipient_id}`,attachments:[{filename:row.title.replace(/\.(pdf|docx?|html?)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+' - Signed.pdf',content:row.signed_pdf,contentType:'application/pdf'}]});}
   catch(error){result={success:false,error:error instanceof Error?error.message:'Email delivery failed'};}
   const status=result.simulated?'simulated':result.success?'sent':row.attempts>=5?'failed':'pending';
   await client.query(`UPDATE signature_completion_emails SET status=$2,attempts=attempts+1,resend_id=$3,last_error=$4,sent_at=CASE WHEN $2='sent' THEN NOW() ELSE NULL END,next_attempt_at=NOW()+INTERVAL '5 minutes' WHERE recipient_id=$1`,[row.recipient_id,status,result.id||null,result.error||null]);
   await client.query(`INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,body_html,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[result.id||null,row.entity_type,row.entity_id,row.to_email,OUTBOUND_EMAIL_ADDRESS,row.subject,row.body_html,result.simulated?'simulated':result.success?'sent':'failed']);
   await client.query(`INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES($1,'signed_document_email',$2,$3,$4)`,[OUTBOUND_EMAIL_ADDRESS,row.entity_type,row.entity_id,JSON.stringify({request_id:row.request_id,recipient_id:row.recipient_id,status})]);
   await client.query('COMMIT');if(status==='sent')sent++;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 return sent;
}
