import type {Express,Response} from 'express';
import type {PoolClient} from 'pg';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import pool from './db-pg';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import {guarantorApplicationReady,guarantorRequirementReady} from './guarantor-validation';
import {guarantorState,guarantorFiles,formRules,saveGuarantorForm,guarantorApplicationUrl} from './guarantor-state';
import {executionHash,sealGuarantorToken,openGuarantorToken,GUARANTOR_EXECUTION_CONSENT_VERSION} from './guarantor-execution-rules';
import {signGuarantorExecution,attestGuarantorExecution} from './guarantor-execution';
import {deliverGuarantorExecutionEmails,requestGuarantorWitnessResend} from './guarantor-execution-email';
import {prepareApplicationDeed,guarantorTenancyContext} from './guarantor-tenancy';
import {guarantorRequestEmail,guarantorWitnessEmail,guarantorChangesEmail,sendEmail,OUTBOUND_EMAIL_ADDRESS} from './email';
import {guarantorEvidenceCategories,assertGuarantorEvidenceEditable,storeGuarantorEvidence,guarantorEvidencePath} from './guarantor-evidence';
import {guarantorReviewDecision,guarantorRequestedChanges,assertGuarantorReviewComplete,resubmitGuarantorCorrections} from './guarantor-review';
import {creditReportResult,isValidManualCreditScore} from './credit-report-result';

async function enquiry(client:PoolClient,id:number,lock=false){
 const row=(await client.query(`SELECT e.*,p.address AS property_address,p.postcode AS property_postcode,p.city AS property_city FROM tenant_enquiries e LEFT JOIN properties p ON p.id=e.linked_property_id WHERE e.id=$1${lock?' FOR UPDATE OF e':''}`,[id])).rows[0];
 if(!row)throw Error('Applicant not found');return row;
}
async function audit(client:PoolClient,req:any,id:number,action:string,changes:any={}){
 await client.query(`INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,'tenant_enquiry',$4,$5)`,[req.user?.id||null,req.user?.email||'public-guarantor',action,id,JSON.stringify(changes)]);
}
const addEvent=(workflow:any,action:string)=>({...workflow,events:[...(workflow.events||[]),{action,at:new Date().toISOString()}].slice(-300)});
async function transaction<T>(work:(client:PoolClient)=>Promise<T>){const client=await pool.connect();try{await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
async function publicGuarantor(client:PoolClient,token:string,lock=false){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('This application invitation is unavailable');
 const found=(await client.query('SELECT enquiry_id FROM guarantor_verifications WHERE token_hash=$1',[executionHash(token)])).rows[0];
 if(!found)throw Error('This application invitation is unavailable');
 const e=await enquiry(client,found.enquiry_id,lock);
 const g=(await client.query(`SELECT * FROM guarantor_verifications WHERE enquiry_id=$1 AND token_hash=$2${lock?' FOR UPDATE':''}`,[e.id,executionHash(token)])).rows[0];
 if(!g||e.guarantor_required!==true||!g.expires_at||new Date(g.expires_at).getTime()<=Date.now())throw Error('This application invitation has expired or been withdrawn');
 return {e,g};
}
async function publicWitness(client:PoolClient,token:string,lock=false){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('This witness invitation is unavailable');
 const found=(await client.query('SELECT verification_id FROM guarantor_executions WHERE witness_token_hash=$1',[executionHash(token)])).rows[0];
 if(!found)throw Error('This witness invitation is unavailable');
 if(lock)await client.query('SELECT e.id FROM tenant_enquiries e JOIN guarantor_verifications g ON g.enquiry_id=e.id WHERE g.id=$1 FOR UPDATE OF e',[found.verification_id]);
 const g=(await client.query(`SELECT g.*,e.guarantor_required FROM guarantor_verifications g JOIN tenant_enquiries e ON e.id=g.enquiry_id WHERE g.id=$1${lock?' FOR UPDATE OF g':''}`,[found.verification_id])).rows[0];
 const row=(await client.query(`SELECT * FROM guarantor_executions WHERE witness_token_hash=$1${lock?' FOR UPDATE':''}`,[executionHash(token)])).rows[0];
 if(!g||g.guarantor_required!==true||!row||g.execution_id!==row.id||!['awaiting_witness','completed','witness_declined'].includes(row.status)||!row.witness_expires_at||new Date(row.witness_expires_at).getTime()<=Date.now())throw Error('This witness invitation has expired or been replaced');
 return {g,row};
}

export function registerGuarantorApplication(app:Express,uploadsDir:string){
 const staff=[authMiddleware,requirePermission('staff')],base='/api/tenant-enquiries/:id/guarantor';
 const handle=(work:(req:any,res:Response)=>Promise<any>)=>async(req:any,res:Response)=>{try{await work(req,res);}catch(error){res.status(409).json({error:error instanceof Error?error.message:'The guarantor application could not be updated'});}};
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}});
 const staffState=async(id:number)=>transaction(async client=>{const e=await enquiry(client,id);const g=(await client.query('SELECT * FROM guarantor_verifications WHERE enquiry_id=$1',[id])).rows[0];return guarantorState(client,g,e,true);});
 app.get(base,...staff,handle(async(req,res)=>res.json(await staffState(Number(req.params.id)))));
 app.post(base,...staff,handle(async(req:AuthRequest,res)=>{
  const id=Number(req.params.id),body=req.body;let deliver:any=null;
  await transaction(async client=>{
   const e=await enquiry(client,id,true);let g=(await client.query('SELECT * FROM guarantor_verifications WHERE enquiry_id=$1 FOR UPDATE',[id])).rows[0];
   const decidingRequirement=body.action==='require'||body.action==='reset';
   if(decidingRequirement?!guarantorRequirementReady(e):!guarantorApplicationReady(e))throw Error(decidingRequirement?'Submit an active tenant application before choosing its guarantor requirement':'Complete and approve the tenant application before the guarantor stage');
   if(['require','contact','tenancy-date','reset','restart','invite'].includes(body.action)&&(await client.query("SELECT id FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void'",[[id,e.joint_partner_id].filter(Boolean)])).rowCount)throw Error('Review the issued tenancy agreement before changing this guarantor application');
   if(body.action==='require'||body.action==='reset'){
    const required=body.action==='reset'?null:body.value;if(required!==null&&typeof required!=='boolean')throw Error('Choose Yes or No');
    if(g?.signature)throw Error('A signed deed must be reviewed before changing its guarantor requirement');
    await client.query('UPDATE tenant_enquiries SET guarantor_required=$2,updated_at=NOW() WHERE id=$1',[id,required]);
    if(required===true)await client.query(`INSERT INTO guarantor_verifications(enquiry_id,name,email,phone) VALUES($1,$2,$3,$4) ON CONFLICT(enquiry_id) DO NOTHING`,[id,e.app_guarantor_name||e.guarantor_name||'',e.app_guarantor_email||e.guarantor_email||'',e.app_guarantor_phone||e.guarantor_phone||'']);
    else if(g)await client.query("UPDATE guarantor_verifications SET token_hash=NULL,token_encrypted=NULL,expires_at=NULL,status='draft',updated_at=NOW() WHERE id=$1",[g.id]);
   }else{
    if(!g||e.guarantor_required!==true)throw Error('Confirm that a guarantor is required first');
    let workflow={...g.workflow};
    if(body.action==='contact'){
     if(g.status!=='draft')throw Error('Invited guarantor details are locked');
     const name=String(body.name||'').trim(),email=String(body.email||'').trim(),phone=String(body.phone||'').trim();
     if(!name||name.length>150||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!phone||phone.length>40)throw Error('Enter the guarantor name, email and phone number');
     await client.query('UPDATE guarantor_verifications SET name=$2,email=$3,phone=$4,form=$5,updated_at=NOW() WHERE id=$1',[g.id,name,email,phone,JSON.stringify({...g.form,name,email,phone})]);
    }else if(body.action==='tenancy-date'){
     if(g.status!=='draft')throw Error('The tenancy start date is locked once the invitation is sent');
     const date=String(body.startDate||body.date||'').slice(0,10),parsed=new Date(date+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('Enter a valid tenancy start date');
     const rent=Number(body.monthlyRent??e.monthly_rent_agreed),deposit=Number(body.deposit??e.security_deposit_amount);
     if(!Number.isFinite(rent)||rent<=0||!Number.isFinite(deposit)||deposit<0)throw Error('Enter a valid monthly rent and security deposit');
     await client.query('UPDATE tenant_enquiries SET monthly_rent_agreed=$2,security_deposit_amount=$3 WHERE id=ANY($1::int[])',[[id,e.joint_partner_id].filter(Boolean),rent,deposit]);
     await client.query("UPDATE tenant_enquiries SET app_form_data=COALESCE(app_form_data,'{}'::jsonb)||jsonb_build_object('tenancy_start_date',$2::text),updated_at=NOW() WHERE id=ANY($1::int[])",[[id,e.joint_partner_id].filter(Boolean),date]);
    }else if(body.action==='invite'||body.action==='resend'){
     if(body.witness){
      const execution=(await client.query('SELECT * FROM guarantor_executions WHERE id=$1 FOR UPDATE',[g.execution_id])).rows[0];
      if(execution?.status!=='awaiting_witness')throw Error('There is no pending witness invitation');
      await requestGuarantorWitnessResend(client,Number(execution.id));
      deliver={executionId:Number(execution.id)};
     }else{
      if(body.action==='invite'&&g.status!=='draft'||body.action==='resend'&&!['invited','changes_requested'].includes(g.status))throw Error('This application is not awaiting an invitation');
      if(body.sendEmail!==true)throw Error('Email delivery is required for the application and signing information');
      const context=await guarantorTenancyContext(client,id);if(!g.name||!/^\S+@\S+\.\S+$/.test(g.email))throw Error('Save valid guarantor contact details first');
      if(body.action==='invite'&&context.input.agreementType==='client'&&body.confirmedLandlordName!==context.particulars.landlord)throw Error('Confirm the current landlord name before sending the guarantor request');
      if(body.action==='invite'&&context.input.agreementType==='client')workflow.landlordConfirmation={name:context.particulars.landlord,at:new Date().toISOString(),by:req.user?.id};
      const token=body.action==='resend'&&g.token_encrypted?openGuarantorToken(g.token_encrypted):crypto.randomBytes(32).toString('hex');
      const previous=workflow.lastResent||workflow.invitationDelivery;
      if(previous?.at&&Date.now()-new Date(previous.at).getTime()<30000)throw Error('An invitation has just been requested. Check its delivery status before resending');
      const at=new Date().toISOString(),delivery={email:true,sms:body.sendSms===true,at,status:'pending'};
      workflow=addEvent(workflow,body.action==='invite'?'invite':'invitation_resent');workflow[body.action==='invite'?'invitationDelivery':'lastResent']=delivery;
      await client.query("UPDATE guarantor_verifications SET status=CASE WHEN status='draft' THEN 'invited' ELSE status END,token_hash=$2,token_encrypted=$3,expires_at=NOW()+INTERVAL '30 days',workflow=$4,updated_at=NOW() WHERE id=$1",[g.id,executionHash(token),sealGuarantorToken(token),JSON.stringify(workflow)]);
      deliver={g:{...g,workflow},message:guarantorRequestEmail({guarantorName:g.name,tenantNames:context.particulars.tenantNames,propertyAddress:context.particulars.propertyAddress,monthlyRent:context.particulars.monthlyRent,applicationUrl:guarantorApplicationUrl(token)}),sms:body.sendSms===true,at,key:crypto.randomUUID(),kind:body.action};
     }
    }else if(body.action==='verify'){
     const execution=(await client.query('SELECT status FROM guarantor_executions WHERE id=$1',[g.execution_id])).rows[0],files=await guarantorFiles(client,g.id);
     if(execution?.status!=='completed'||workflow.deedNeedsResigning||workflow.reviewStatus!=='approved'||!workflow.credit?.credit_check_completed||!files.some(file=>file.category==='Credit Check Report'))throw Error('Complete both signatures, the application review and guarantor credit check before approval');
     await (await import('./guarantor-gates')).assertCurrentGuarantorTerms(client,g.id);
     await client.query("UPDATE guarantor_verifications SET status='verified',verified_at=NOW(),verified_by=$2,workflow=$3,updated_at=NOW() WHERE id=$1",[g.id,req.user?.id,JSON.stringify(addEvent(workflow,'verified'))]);
    }else if(body.action==='restart'){
     if(!g.signature||(!workflow.deedNeedsResigning&&g.status!=='witness_declined'))throw Error('There is no declined or changed deed requiring a new signing');
     if(g.execution_id){await client.query("UPDATE guarantor_executions SET status='superseded' WHERE id=$1",[g.execution_id]);await client.query("UPDATE guarantor_execution_emails SET status='cancelled' WHERE execution_id=$1 AND status='pending'",[g.execution_id]);}
     workflow=addEvent({...workflow,deedNeedsResigning:false,reason:null},'restart');
     await client.query("UPDATE guarantor_verifications SET execution_id=NULL,signature=NULL,status='invited',verified_at=NULL,verified_by=NULL,workflow=$2,updated_at=NOW() WHERE id=$1",[g.id,JSON.stringify(workflow)]);
    }else throw Error('Unknown guarantor action');
   }
   await audit(client,req,id,'guarantor_'+body.action);
  });
  if(deliver?.executionId)await deliverGuarantorExecutionEmails(deliver.executionId);
  else if(deliver){
   let result;try{result=await sendEmail({to:deliver.g.email,...deliver.message,idempotencyKey:'guarantor-invitation-'+deliver.key});}catch(error){result={success:false,error:error.message};}
   await transaction(async client=>{
    const row=(await client.query('SELECT workflow FROM guarantor_verifications WHERE id=$1 FOR UPDATE',[deliver.g.id])).rows[0],key=deliver.kind==='invite'?'invitationDelivery':'lastResent',workflow=row.workflow;
    if(workflow[key]?.at===deliver.at)workflow[key]={...workflow[key],status:result.simulated?'simulated':result.success?'sent':'failed',error:result.error||null};
    await client.query('UPDATE guarantor_verifications SET workflow=$2 WHERE id=$1',[deliver.g.id,JSON.stringify(workflow)]);
    await client.query(`INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,sent_by,sent_by_email,error_message) VALUES($1,'tenant_enquiry',$2,$3,$4,$5,'guarantor_request',$6,$7,$8,$9,$10)`,[result.id||null,id,deliver.g.email,OUTBOUND_EMAIL_ADDRESS,deliver.message.subject,deliver.message.html,result.simulated?'simulated':result.success?'sent':'failed',req.user?.id,req.user?.email,result.error||null]);
   });
   // The SMS is a notification; it never replaces the document and signing email.
   if(deliver.sms&&result.success&&!result.simulated){const {sendSms,normalizeUkPhone,SMS_FROM}=require('./sms');const text=`Hi ${deliver.g.name.split(' ')[0]}, your guarantor application and Deed of Guarantee have been emailed to you. Please check your inbox. If you need help, call Fleming Lettings on 01902 212 415.`;const to=normalizeUkPhone(deliver.g.phone);const sent=await sendSms({to,body:text});await pool.query(`INSERT INTO sms_messages(enquiry_id,entity_type,entity_id,to_phone,from_phone,message_body,status,twilio_sid,error_message,sent_by,sent_by_email) VALUES($1,'tenant_enquiry',$1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,to,SMS_FROM||null,text,sent.simulated?'simulated':sent.success?'sent':'failed',sent.sid||null,sent.error||null,req.user?.id,req.user?.email]);
    await transaction(async client=>{const current=(await client.query('SELECT workflow FROM guarantor_verifications WHERE id=$1 FOR UPDATE',[deliver.g.id])).rows[0],key=deliver.kind==='invite'?'invitationDelivery':'lastResent';if(current.workflow[key]?.at===deliver.at){current.workflow[key].smsStatus=sent.simulated?'simulated':sent.success?'sent':'failed';current.workflow[key].smsError=sent.error||null;await client.query('UPDATE guarantor_verifications SET workflow=$2 WHERE id=$1',[deliver.g.id,JSON.stringify(current.workflow)]);}});
   }else if(deliver.sms){await transaction(async client=>{const current=(await client.query('SELECT workflow FROM guarantor_verifications WHERE id=$1 FOR UPDATE',[deliver.g.id])).rows[0],key=deliver.kind==='invite'?'invitationDelivery':'lastResent';if(current.workflow[key]?.at===deliver.at){current.workflow[key].smsStatus='not_sent';current.workflow[key].smsError='The application email was not sent';await client.query('UPDATE guarantor_verifications SET workflow=$2 WHERE id=$1',[deliver.g.id,JSON.stringify(current.workflow)]);}});}
  }
  res.json(await staffState(id));
 }));

 app.post(base+'/email-preview',...staff,handle(async(req,res)=>{
  const state=await staffState(Number(req.params.id));const details={guarantorName:state.contact.name,tenantNames:state.tenancy.tenantNames,propertyAddress:state.tenancy.propertyAddress};
  const message=req.body.witness?guarantorWitnessEmail({...details,witnessName:state.form.witnessName||'Witness',applicationUrl:state.witnessUrl||'#preview'}):guarantorRequestEmail({...details,monthlyRent:Number(state.tenancy.monthlyRent),applicationUrl:state.applicationUrl||'#preview'});
  res.json({...message,to:req.body.witness?state.form.witnessEmail:state.contact.email,from:OUTBOUND_EMAIL_ADDRESS});
 }));
 app.post(base+'/sms-preview',...staff,handle(async(req,res)=>{const state=await staffState(Number(req.params.id));res.json({to:state.contact.phone,text:`Hi ${state.contact.name.split(' ')[0]}, your guarantor application and Deed of Guarantee have been emailed to you. Please check your inbox. If you need help, call Fleming Lettings on 01902 212 415.`});}));
 app.get(base+'/completed-copy',...staff,handle(async(req,res)=>{const row=(await pool.query('SELECT x.signed_pdf FROM guarantor_verifications g JOIN guarantor_executions x ON x.id=g.execution_id WHERE g.enquiry_id=$1 AND x.status=\'completed\'',[req.params.id])).rows[0];if(!row?.signed_pdf)return res.sendStatus(404);res.set('Cache-Control','no-store').type('pdf').send(row.signed_pdf);}));

 async function officeReview(client:PoolClient,id:number,allowWaiting=false){
  const e=await enquiry(client,id,true),g=(await client.query('SELECT * FROM guarantor_verifications WHERE enquiry_id=$1 FOR UPDATE',[id])).rows[0];
  if(!guarantorApplicationReady(e)||e.guarantor_required!==true||!g?.signature)throw Error('Wait for the guarantor to submit their application and sign');
  if((await client.query("SELECT id FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void'",[[id,e.joint_partner_id].filter(Boolean)])).rowCount)throw Error('Review the issued tenancy agreement before changing the guarantor review');
  if(!allowWaiting&&g.workflow?.reviewStatus==='changes_requested'&&g.workflow?.changesSent)throw Error('Wait for the guarantor to resubmit the requested corrections');
  return {e,g};
 }
 async function saveReview(client:PoolClient,g:any,workflow:any){
  await client.query("UPDATE guarantor_verifications SET workflow=$2,status=CASE WHEN status='verified' THEN 'submitted' ELSE status END,verified_at=NULL,verified_by=NULL,updated_at=NOW() WHERE id=$1",[g.id,JSON.stringify(workflow)]);
 }
 app.get(base+'/record',...staff,handle(async(req,res)=>res.json((await staffState(Number(req.params.id))).record)));
 app.get(base+'/files',...staff,handle(async(req,res)=>res.json((await staffState(Number(req.params.id))).documents)));
 app.put(base+'/section-review',...staff,handle(async(req,res)=>{
  await transaction(async client=>{const {g}=await officeReview(client,Number(req.params.id));const workflow=guarantorReviewDecision(g,String(req.body.section||''),String(req.body.status||''),String(req.body.reason||'').trim(),req.user.id);await saveReview(client,g,workflow);await audit(client,req,g.enquiry_id,'guarantor_section_review',{section:req.body.section,status:req.body.status});});res.json({success:true});
 }));
 app.put(base+'/files/:fileId/review',...staff,handle(async(req,res)=>{
  await transaction(async client=>{const {g}=await officeReview(client,Number(req.params.id)),status=String(req.body.status),notes=String(req.body.notes||'').trim();
   if(!['pending','approved','rejected'].includes(status)||notes.length>4000||(status==='rejected'&&!notes))throw Error('Choose a document decision and explain any rejection');
   const file=(await client.query("UPDATE guarantor_verification_files SET review_status=$3,review_notes=$4 WHERE id=$1 AND verification_id=$2 AND current=TRUE AND category<>'Credit Check Report' RETURNING id",[req.params.fileId,g.id,status,status==='rejected'?notes:null])).rows[0];
   if(!file)throw Error('Choose a current supporting document');await saveReview(client,g,{...g.workflow,reviewStatus:'pending'});await audit(client,req,g.enquiry_id,'guarantor_document_review',{file_id:file.id,status});
  });res.json({success:true});
 }));
 app.put(base+'/files/:fileId/category',...staff,handle(async(req,res)=>{
  await transaction(async client=>{const {g}=await officeReview(client,Number(req.params.id)),category=String(req.body.doc_type||'');
   if(![...guarantorEvidenceCategories,'Other'].includes(category))throw Error('Choose a supporting evidence category');
   const duplicate=await client.query('SELECT id FROM guarantor_verification_files WHERE verification_id=$1 AND current=TRUE AND category=$2 AND id<>$3',[g.id,category,req.params.fileId]);if(duplicate.rowCount&&category!=='Other')throw Error('This category already has a document. Review it before recategorising another');
   const file=(await client.query("UPDATE guarantor_verification_files SET category=$3,review_status='pending',review_notes=NULL WHERE id=$1 AND verification_id=$2 AND current=TRUE AND category<>'Credit Check Report' RETURNING id",[req.params.fileId,g.id,category])).rows[0];
   if(!file)throw Error('Choose a current supporting document');await saveReview(client,g,{...g.workflow,reviewStatus:'pending'});await audit(client,req,g.enquiry_id,'guarantor_document_category',{file_id:file.id,category});
  });res.json({success:true});
 }));
 app.put(base+'/document-override',...staff,handle(async()=>{throw Error('Guarantor identity, address and financial evidence must be supplied and reviewed; request the missing document');}));
 app.post(base+'/application-review/email-preview',...staff,handle(async(req,res)=>{
  const message=await transaction(async client=>{const {g}=await officeReview(client,Number(req.params.id),true),files=await guarantorFiles(client,g.id),changes=guarantorRequestedChanges(g,files);if(!changes)throw Error('Record the requested corrections first');return guarantorChangesEmail(g.form.name||g.name,changes,guarantorApplicationUrl(openGuarantorToken(g.token_encrypted)));});res.json(message);
 }));
 app.post(base+'/application-review',...staff,handle(async(req,res)=>{
  let delivery:any=null;
  await transaction(async client=>{const {g}=await officeReview(client,Number(req.params.id),true),files=await guarantorFiles(client,g.id),status=String(req.body.status),notes=String(req.body.notes||'').trim();
   if(notes.length>10000)throw Error('The internal note is too long');
   if(g.workflow?.reviewStatus==='changes_requested'&&g.workflow?.changesSent)throw Error('Wait for the guarantor to resubmit their corrections');
   let workflow={...g.workflow};
   if(status==='approved'){assertGuarantorReviewComplete(g,files);workflow={...workflow,reviewStatus:'approved',changesSent:null};}
   else if(status==='changes_requested'){
    const message=guarantorRequestedChanges(g,files);if(!message)throw Error('Record a rejected section, rejected document or missing evidence first');
    if(req.body.send_email!==true)throw Error('Send the guarantor an email with their requested corrections');
    const same=workflow.changes?.message===message&&workflow.reviewStatus==='changes_requested';
    const requestId=same&&workflow.changes?.request_id?workflow.changes.request_id:crypto.randomUUID();
    workflow={...workflow,reviewStatus:'changes_requested',changesSent:null,revisionEdits:[],revisionUploads:[],changes:{message,internal_notes:notes,requested_at:new Date().toISOString(),request_id:requestId}};
    delivery={verificationId:g.id,enquiryId:g.enquiry_id,to:g.form.email||g.email,name:g.form.name||g.name,phone:g.form.phone||g.phone,sendSms:req.body.send_sms===true,url:guarantorApplicationUrl(openGuarantorToken(g.token_encrypted)),message:guarantorChangesEmail(g.form.name||g.name,message,guarantorApplicationUrl(openGuarantorToken(g.token_encrypted))),requestId};
   }else throw Error('Choose Approve or Changes Required');
   if(notes)workflow.notes=[...(workflow.notes||[]),{id:'application-review-'+crypto.randomUUID(),text:notes,author:req.user.email,created_at:new Date().toISOString()}];
   await saveReview(client,g,workflow);if(status==='changes_requested')await client.query("UPDATE guarantor_verifications SET status='changes_requested' WHERE id=$1",[g.id]);
   await audit(client,req,g.enquiry_id,'guarantor_application_review',{status,notes});
  });
  let result:any={success:true};
  if(delivery){
   try{result=await sendEmail({to:delivery.to,...delivery.message,idempotencyKey:'guarantor-corrections-'+delivery.requestId});}catch(error){result={success:false,error:error.message};}
   await transaction(async client=>{const g=(await client.query('SELECT * FROM guarantor_verifications WHERE id=$1 FOR UPDATE',[delivery.verificationId])).rows[0];
    if(g.workflow.changes?.request_id===delivery.requestId){g.workflow.changesDelivery={status:result.simulated?'simulated':result.success?'sent':'failed',error:result.error||null};if(result.success&&!result.simulated)g.workflow.changesSent=new Date().toISOString();await client.query('UPDATE guarantor_verifications SET workflow=$2 WHERE id=$1',[g.id,JSON.stringify(g.workflow)]);}
    await client.query(`INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,sent_by,sent_by_email,error_message) VALUES($1,'tenant_enquiry',$2,$3,$4,$5,'guarantor_changes',$6,$7,$8,$9,$10)`,[result.id||null,delivery.enquiryId,delivery.to,OUTBOUND_EMAIL_ADDRESS,delivery.message.subject,delivery.message.html,result.simulated?'simulated':result.success?'sent':'failed',req.user.id,req.user.email,result.error||null]);
   });
  }
  let smsResult:any;
  if(delivery?.sendSms&&result.success&&!result.simulated){
   const {sendSms,normalizeUkPhone,SMS_FROM}=require('./sms');
   const message=`Hi ${delivery.name}, we have reviewed your application and require further information or documentation. Please reopen your application: ${delivery.url}. For help, call 01902 212 415. Fleming Lettings.`;
   try{const to=normalizeUkPhone(delivery.phone);smsResult=await sendSms({to,body:message});await pool.query(`INSERT INTO sms_messages(enquiry_id,entity_type,entity_id,to_phone,from_phone,message_body,status,twilio_sid,error_message,sent_by,sent_by_email) VALUES($1,'tenant_enquiry',$1,$2,$3,$4,$5,$6,$7,$8,$9)`,[delivery.enquiryId,to,SMS_FROM||null,message,smsResult.simulated?'simulated':smsResult.success?'sent':'failed',smsResult.sid||null,smsResult.error||null,req.user.id,req.user.email]);}catch(error){smsResult={success:false,error:error.message};}
  }else if(delivery?.sendSms)smsResult={success:false,error:'The correction email was not sent; SMS was not sent'};
  res.json({success:true,delivery:delivery?{email:result,...smsResult?{sms:smsResult}:{}}:undefined});
 }));
 app.post(base+'/credit-check',...staff,upload.single('report'),handle(async(req,res)=>{
  let written='';try{await transaction(async client=>{const {g}=await officeReview(client,Number(req.params.id)),files=await guarantorFiles(client,g.id),details=creditReportResult(req.body.result,String(req.body.score||''));
   if(!isValidManualCreditScore(details.score))throw Error('Enter a numeric credit score');assertGuarantorEvidenceEditable(g,'Credit Check Report',files,true);
   const stored=await storeGuarantorEvidence(client,g,'Credit Check Report',req.file,uploadsDir);written=stored.location;
   await client.query("UPDATE guarantor_verification_files SET review_status='approved' WHERE id=$1",[stored.id]);
   await saveReview(client,g,{...g.workflow,credit:{credit_check_completed:1,credit_score:details.score,credit_check_date:new Date().toISOString(),credit_check_result:details}});
   await audit(client,req,g.enquiry_id,'guarantor_credit_check',{file_id:stored.id,score:details.score});
  });res.json({success:true});}catch(error){if(written)await fs.promises.unlink(written).catch(()=>{});throw error;}
 }));

 const limit=rateLimit({windowMs:15*60*1000,limit:100,standardHeaders:true,legacyHeaders:false});
 const privacy=(_req:any,res:Response,next:()=>void)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});next();};
 app.use('/api/public/guarantor',limit,privacy);app.use('/api/public/guarantor-witness',limit,privacy);
 const publicBase='/api/public/guarantor/:token',witnessBase='/api/public/guarantor-witness/:token';
 async function invalidatePrepared(client:PoolClient,g:any){
  if(!g.signature&&g.execution_id){await client.query("UPDATE guarantor_executions SET status='superseded' WHERE id=$1 AND status='prepared'",[g.execution_id]);g.execution_id=null;await client.query('UPDATE guarantor_verifications SET execution_id=NULL WHERE id=$1',[g.id]);}
 }
 app.get(base+'/files/:fileId',...staff,handle(async(req,res)=>{
  const file=(await pool.query('SELECT f.* FROM guarantor_verification_files f JOIN guarantor_verifications g ON g.id=f.verification_id WHERE g.enquiry_id=$1 AND f.id=$2',[req.params.id,req.params.fileId])).rows[0];
  if(!file)return res.sendStatus(404);
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}).type(file.mime_type).sendFile(guarantorEvidencePath(uploadsDir,file.filename));
 }));
 app.get(publicBase+'/files/:fileId',handle(async(req,res)=>{
  const file=await transaction(async client=>{const {g}=await publicGuarantor(client,req.params.token);return (await client.query('SELECT * FROM guarantor_verification_files WHERE verification_id=$1 AND id=$2 AND current=TRUE AND category=ANY($3::text[])',[g.id,req.params.fileId,guarantorEvidenceCategories])).rows[0];});
  if(!file)return res.sendStatus(404);
  res.set('Content-Security-Policy','sandbox').type(file.mime_type).sendFile(guarantorEvidencePath(uploadsDir,file.filename));
 }));
 app.post(publicBase+'/files',upload.single('file'),handle(async(req,res)=>{
  let written='';try{
   const result=await transaction(async client=>{
    const {e,g}=await publicGuarantor(client,req.params.token,true),category=String(req.body.category||''),files=await guarantorFiles(client,g.id);
    assertGuarantorEvidenceEditable(g,category,files);
    const stored=await storeGuarantorEvidence(client,g,category,req.file,uploadsDir);written=stored.location;
    await invalidatePrepared(client,g);
    if(g.signature){g.workflow={...g.workflow,revisionUploads:[...new Set([...(g.workflow.revisionUploads||[]),guarantorEvidenceCategories.indexOf(category)])]};await client.query('UPDATE guarantor_verifications SET workflow=$2,updated_at=NOW() WHERE id=$1',[g.id,JSON.stringify(g.workflow)]);}
    await audit(client,req,e.id,'guarantor_evidence_uploaded',{file_id:stored.id,category});return guarantorState(client,g,e);
   });res.json(result);
  }catch(error){if(written)await fs.promises.unlink(written).catch(()=>{});throw error;}
 }));
 app.delete(publicBase+'/files/:fileId',handle(async(req,res)=>res.json(await transaction(async client=>{
  const {e,g}=await publicGuarantor(client,req.params.token,true);
  if(g.signature||g.status!=='invited')throw Error('Submitted evidence is retained. Replace the documents requested by the office instead');
  const file=(await client.query('UPDATE guarantor_verification_files SET current=FALSE WHERE id=$1 AND verification_id=$2 AND current=TRUE AND category=ANY($3::text[]) RETURNING id,category',[req.params.fileId,g.id,guarantorEvidenceCategories])).rows[0];
  if(!file)throw Error('The supporting document is unavailable');await invalidatePrepared(client,g);
  await audit(client,req,e.id,'guarantor_evidence_removed',{file_id:file.id,category:file.category});return guarantorState(client,g,e);
 }))));
 app.get(publicBase,handle(async(req,res)=>res.json(await transaction(async client=>{const {e,g}=await publicGuarantor(client,req.params.token,true);g.workflow={...g.workflow,openedAt:new Date().toISOString()};await client.query('UPDATE guarantor_verifications SET workflow=$2 WHERE id=$1',[g.id,JSON.stringify(g.workflow)]);return {...await guarantorState(client,g,e),consentVersion:GUARANTOR_EXECUTION_CONSENT_VERSION,role:'guarantor'};}))));
 app.post(publicBase+'/form',handle(async(req,res)=>res.json(await transaction(async client=>{
  const {e,g}=await publicGuarantor(client,req.params.token,true),saved=saveGuarantorForm(g,req.body.form,req.body.introAccepted===true);
  if(!g.signature&&g.execution_id){await client.query("UPDATE guarantor_executions SET status='superseded' WHERE id=$1 AND status='prepared'",[g.execution_id]);g.execution_id=null;}
  Object.assign(g,saved);await client.query('UPDATE guarantor_verifications SET form=$2,workflow=$3,execution_id=$4,updated_at=NOW() WHERE id=$1',[g.id,JSON.stringify(saved.form),JSON.stringify(saved.workflow),g.execution_id]);return guarantorState(client,g,e);
 }))));
 app.post(publicBase+'/prepare-deed',handle(async(req,res)=>res.json(await transaction(async client=>{
  const {g}=await publicGuarantor(client,req.params.token,true);const {groups,validateGroup,validateWitness,categories}=formRules();
  if(!g.workflow.introAcceptedAt||g.form.consent!==true||g.form.accurate!==true)throw Error('Read the introduction and confirm both application declarations');
  for(const group of groups)validateGroup(group.title,g.form);validateWitness(g.form);
  const files=await guarantorFiles(client,g.id);if(categories.slice(0,4).some((item:any)=>!files.some(file=>file.category===item[1])))throw Error('Upload all four required evidence categories');
  const row=await prepareApplicationDeed(client,g);return {sourceHash:row.source_sha256,executionId:row.id,consentVersion:GUARANTOR_EXECUTION_CONSENT_VERSION};
 }))));
 app.post(publicBase+'/resubmit',handle(async(req,res)=>res.json(await transaction(async client=>{
  const {e,g}=await publicGuarantor(client,req.params.token,true),files=await guarantorFiles(client,g.id);g.workflow=resubmitGuarantorCorrections(g,files);
  const execution=(await client.query('SELECT status FROM guarantor_executions WHERE id=$1',[g.execution_id])).rows[0];
  g.status=execution?.status==='completed'?'submitted':execution?.status==='witness_declined'?'witness_declined':'awaiting_witness';
  await client.query('UPDATE guarantor_verifications SET workflow=$2,status=$3,submitted_at=NOW(),updated_at=NOW() WHERE id=$1',[g.id,JSON.stringify(g.workflow),g.status]);
  await audit(client,req,e.id,'guarantor_corrections_resubmitted');return guarantorState(client,g,e);
 }))));
 app.get(publicBase+'/deed',handle(async(req,res)=>{const bytes=await transaction(async client=>{const {g}=await publicGuarantor(client,req.params.token);const row=(await client.query('SELECT source_pdf,partially_signed_pdf,signed_pdf FROM guarantor_executions WHERE id=$1',[g.execution_id])).rows[0];if(!row)throw Error('Prepare the deed first');return row.signed_pdf||row.partially_signed_pdf||row.source_pdf;});res.type('pdf').send(bytes);}));
 app.post(publicBase+'/sign',handle(async(req,res)=>{
  if(req.body.consentVersion!==GUARANTOR_EXECUTION_CONSENT_VERSION)throw Error('Refresh the page and review the current signing declarations');
  const row=await transaction(async client=>{const {e,g}=await publicGuarantor(client,req.params.token,true);
   if(!g.signature){const files=await guarantorFiles(client,g.id);if(guarantorEvidenceCategories.slice(0,4).some(category=>!files.some(file=>file.category===category)))throw Error('Upload all four required evidence categories before signing');}
   const signed=await signGuarantorExecution(client,g.id,executionHash(req.params.token),{...req.body,ip:req.ip,userAgent:req.headers['user-agent']});if(!g.signature)await audit(client,req,e.id,'guarantor_application_submitted',{execution_id:signed.id});return signed;});
  await deliverGuarantorExecutionEmails(Number(row.id)).catch(error=>console.error('[Guarantor email]',error.message));res.json({success:true,status:row.status});
 }));
 app.get(witnessBase,handle(async(req,res)=>res.json(await transaction(async client=>{
  const {g,row}=await publicWitness(client,req.params.token,true);await client.query('UPDATE guarantor_verifications SET workflow=$2 WHERE id=$1',[g.id,JSON.stringify({...g.workflow,witnessOpenedAt:new Date().toISOString()})]);
  // Deliberately exclude employment, bank data, evidence files and review notes.
  const f=row.form_snapshot;return {role:'witness',status:row.status,sourceHash:row.source_sha256,consentVersion:GUARANTOR_EXECUTION_CONSENT_VERSION,form:{name:f.name,witnessName:f.witnessName,witnessAddress:f.witnessAddress},tenancy:{tenantNames:row.tenancy_snapshot.tenantNames,propertyAddress:row.tenancy_snapshot.propertyAddress,startDate:row.tenancy_snapshot.startDate},signed:{name:row.guarantor_signature.name,at:row.guarantor_signature.signed_at},witnessed:row.witness_signature?{name:row.witness_signature.name,at:row.witness_signature.signed_at}:null};
 }))));
 app.get(witnessBase+'/deed',handle(async(req,res)=>{const bytes=await transaction(async client=>{const {row}=await publicWitness(client,req.params.token);return row.signed_pdf||row.partially_signed_pdf;});res.type('pdf').send(bytes);}));
 app.post(witnessBase+'/sign',handle(async(req,res)=>{
  if(req.body.consentVersion!==GUARANTOR_EXECUTION_CONSENT_VERSION)throw Error('Refresh the page and review the current witness declarations');
  const row=await transaction(client=>attestGuarantorExecution(client,req.params.token,{...req.body,ip:req.ip,userAgent:req.headers['user-agent']}));
  await deliverGuarantorExecutionEmails(Number(row.id)).catch(error=>console.error('[Guarantor email]',error.message));res.json({success:true,status:row.status});
 }));
 app.post(witnessBase+'/decline',handle(async(req,res)=>{await transaction(async client=>{const {g,row}=await publicWitness(client,req.params.token,true);if(row.status!=='awaiting_witness')throw Error('This deed is not awaiting attestation');const reason=String(req.body.reason||'').trim();if(!reason||reason.length>2000)throw Error('Explain why you cannot attest');await client.query("UPDATE guarantor_executions SET status='witness_declined',declined_at=NOW(),decline_reason=$2 WHERE id=$1",[row.id,reason]);await client.query("UPDATE guarantor_verifications SET status='witness_declined',workflow=$2 WHERE id=$1",[g.id,JSON.stringify(addEvent({...g.workflow,reason},'decline'))]);await audit(client,req,g.enquiry_id,'guarantor_witness_declined',{execution_id:row.id,reason});});res.json({success:true});}));
}
