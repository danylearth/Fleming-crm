import type {PoolClient} from 'pg';
import pool from './db-pg';
import {guarantorCompletedEmail,guarantorWitnessEmail,sendEmail,OUTBOUND_EMAIL_ADDRESS} from './email';

export async function requestGuarantorWitnessResend(client:PoolClient,executionId:number){
 const row=(await client.query(`SELECT m.*,e.status AS execution_status,e.witness_expires_at
  FROM guarantor_execution_emails m JOIN guarantor_executions e ON e.id=m.execution_id
  WHERE m.execution_id=$1 AND m.kind='witness_request' FOR UPDATE OF m,e`,[executionId])).rows[0];
 if(!row||row.execution_status!=='awaiting_witness'||new Date(row.witness_expires_at).getTime()<=Date.now())throw Error('There is no current witness invitation to resend');
 if(row.status==='pending')throw Error('The witness invitation is queued for delivery. Check its delivery status before resending');
 if(Date.now()-new Date(row.sent_at||row.queued_at).getTime()<30000)throw Error('The witness invitation has just been requested. Wait before resending');
 // A failed delivery within the provider's retry window keeps its key. An
 // explicit resend of a delivered message is a new, separately audited send.
 const retry=row.status==='failed'&&row.attempts<6&&Date.now()-new Date(row.queued_at).getTime()<23*60*60*1000;
 await client.query(`UPDATE guarantor_execution_emails SET status='pending',last_error=NULL,next_attempt_at=NOW(),
  send_revision=send_revision+CASE WHEN $2 THEN 0 ELSE 1 END,
  attempts=CASE WHEN $2 THEN attempts ELSE 0 END,
  queued_at=CASE WHEN $2 THEN queued_at ELSE NOW() END,
  sent_at=NULL,resend_id=NULL WHERE id=$1`,[row.id,retry]);
}

export async function queueGuarantorExecutionEmail(client:PoolClient,row:any,kind:'witness_request'|'completed_deed',witnessUrl?:string){
 const form=row.form_snapshot,tenancy=row.tenancy_snapshot;
 const details={guarantorName:form.name,tenantNames:tenancy.tenantNames,propertyAddress:tenancy.propertyAddress,witnessName:row.witness_signature?.name||form.witnessName};
 if(kind==='witness_request'&&(!row.guarantor_signature||row.status!=='awaiting_witness'||!witnessUrl))throw Error('The guarantor must sign before a witness request is queued');
 if(kind==='completed_deed'&&(!row.guarantor_signature||!row.witness_signature||row.status!=='completed'||!row.signed_pdf))throw Error('Both signatures and the completed PDF are required before sending a copy');
 const message=kind==='witness_request'?guarantorWitnessEmail({...details,applicationUrl:witnessUrl!}):guarantorCompletedEmail({...details,tenancyStartDate:tenancy.startDate,completedAt:row.completed_at});
 await client.query(`INSERT INTO guarantor_execution_emails(execution_id,kind,to_email,subject,body_html) VALUES($1,$2,$3,$4,$5) ON CONFLICT(execution_id,kind) DO NOTHING`,[row.id,kind,kind==='witness_request'?form.witnessEmail:form.email,message.subject,message.html]);
}

export async function deliverGuarantorExecutionEmails(executionId?:number,deliver:typeof sendEmail=sendEmail){
 let sent=0;
 for(let index=0;index<25;index++){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query(`UPDATE guarantor_execution_emails SET status='failed',last_error='Automatic retry window ended; check delivery before resending' WHERE status='pending' AND (attempts>=6 OR queued_at<NOW()-INTERVAL '23 hours')`);
   const row=(await client.query(`SELECT m.*,e.status AS execution_status,e.signed_pdf,e.guarantor_signature,e.witness_signature,g.enquiry_id
     FROM guarantor_execution_emails m JOIN guarantor_executions e ON e.id=m.execution_id JOIN guarantor_verifications g ON g.id=e.verification_id
     WHERE m.status='pending' AND m.next_attempt_at<=NOW() AND ($1::bigint IS NULL OR e.id=$1)
     ORDER BY m.id LIMIT 1 FOR UPDATE OF m,e SKIP LOCKED`,[executionId??null])).rows[0];
   if(!row){await client.query('COMMIT');break;}
   const ready=row.kind==='witness_request'?row.execution_status==='awaiting_witness'&&row.guarantor_signature:row.execution_status==='completed'&&row.guarantor_signature&&row.witness_signature&&row.signed_pdf;
   if(!ready){await client.query("UPDATE guarantor_execution_emails SET status='cancelled',last_error='The signing version is no longer awaiting this message' WHERE id=$1",[row.id]);await client.query('COMMIT');continue;}
   let result:Awaited<ReturnType<typeof sendEmail>>;
   try{result=await deliver({to:row.to_email,subject:row.subject,html:row.body_html,idempotencyKey:`guarantor-execution-${row.execution_id}-${row.kind}${row.send_revision?'-resend-'+row.send_revision:''}`,attachments:row.kind==='completed_deed'?[{filename:'Deed of Guarantee - signed.pdf',content:row.signed_pdf,contentType:'application/pdf'}]:undefined});}
   catch(error){result={success:false,error:error instanceof Error?error.message:'Email delivery failed'};}
   const status=result.simulated?'simulated':result.success?'sent':row.attempts>=5?'failed':'pending';
   await client.query(`UPDATE guarantor_execution_emails SET status=$2,attempts=attempts+1,resend_id=$3,last_error=$4,sent_at=CASE WHEN $2='sent' THEN NOW() ELSE NULL END,next_attempt_at=NOW()+INTERVAL '5 minutes' WHERE id=$1`,[row.id,status,result.id||null,result.error||null]);
   await client.query(`INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,error_message) VALUES($1,'tenant_enquiry',$2,$3,$4,$5,$6,$7,$8,$9)`,[result.id||null,row.enquiry_id,row.to_email,OUTBOUND_EMAIL_ADDRESS,row.subject,'guarantor_'+row.kind,row.body_html,result.simulated?'simulated':result.success?'sent':'failed',result.error||null]);
   await client.query(`INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES($1,'guarantor_email_delivery','tenant_enquiry',$2,$3)`,[OUTBOUND_EMAIL_ADDRESS,row.enquiry_id,JSON.stringify({execution_id:row.execution_id,kind:row.kind,status})]);
   await client.query('COMMIT');if(status==='sent')sent++;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 return sent;
}
