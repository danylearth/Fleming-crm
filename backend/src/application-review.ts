import type {Express} from 'express';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import pool,{queryOne,query} from './db-pg';
import {includeMissingDocumentRequests,requiredApplicationDocuments} from './application-missing-documents';
import {awaitingApplicationResubmission} from './application-review-request';
import {applicationChangesRequestedEmail} from './email';
export function answerSection(key: string): string {
  if (/guarantor/.test(key)) return 'Guarantor';
  if (/next_of_kin|^nok/.test(key)) return 'Next of Kin';
  if (/^bank|^sort_code|^account_/.test(key)) return 'Bank Details';
  if (/^declaration|signature|^signed_|marketing_consent/.test(key)) return 'Declaration';
  if (/reference|^personal_ref/.test(key)) return 'References';
  if (/income|loans|credit_cards|legal_proceedings/.test(key)) return 'Financial Details';
  if (/employ|^job_|self_assessments|business_|company_number|years_trading|contractor_|accountant|student_/.test(key)) return 'Employment & Income';
  if (/^current_|^previous_|^years_at_|^landlord_contact/.test(key)) return 'Address & Landlord';
  if (/^property_|^rent|^deposit|^preferred_|^tenancy|^forwarding_|parking|pets|occupants|smoking/.test(key)) return 'Tenancy Details';
  if (/supporting_information|further_info/.test(key)) return 'Additional Information';
  return 'Personal Details';
}

export function answerSections(data:Record<string,unknown>){return [...new Set(Object.entries(data||{}).filter(([,v])=>v!==null&&v!==undefined&&(typeof v!=='string'||v.trim()!=='')).map(([k])=>answerSection(k)))];}
export const APPLICATION_DETAILS = 'Application Details';
// Keep historical overall approvals locked when a supporting document changes.
export const retainApprovedAnswersSql = `CASE WHEN application_review_status='approved' THEN jsonb_build_object('Application Details',jsonb_build_object('status','approved','reviewed_at',application_reviewed_at,'reviewed_by',application_reviewed_by)) || COALESCE(application_section_reviews,'{}'::jsonb) ELSE application_section_reviews END`;

export function applicationDataApproved(enquiry: any): boolean {
 const reviews=enquiry.application_section_reviews||{};
 if(reviews[APPLICATION_DETAILS])return reviews[APPLICATION_DETAILS].status==='approved';
 if(enquiry.application_review_status==='approved')return true;
 const sections=answerSections(enquiry.app_form_data||{});
 return sections.length>0&&sections.every(section=>reviews[section]?.status==='approved');
}
export function approvedDataChanged(enquiry:any, submitted:Record<string,unknown>):boolean {
 const allApproved=applicationDataApproved(enquiry);
 const reviews=enquiry.application_section_reviews||{};
 const original=enquiry.app_form_data||{};
 const same=(a:unknown,b:unknown):boolean=>{
  if(a===null||a===undefined||a==='')return b===null||b===undefined||b==='';
  if(typeof a==='boolean'||typeof b==='boolean')return a===b;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  if(typeof a==='object'||typeof b==='object'){
   if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
   return [...new Set([...Object.keys(a),...Object.keys(b)])].every(k=>same((a as any)[k],(b as any)[k]));
  }
  return String(a)===String(b);
 };
 return [...new Set([...Object.keys(original),...Object.keys(submitted)])].some(key=>(allApproved||reviews[answerSection(key)]?.status==='approved')&&!same(original[key],submitted[key]));
}
export function approvedAnswerKeys(enquiry:any):string[] {
 return Object.keys(enquiry.app_form_data||{}).filter(key=>applicationDataApproved(enquiry)||enquiry.application_section_reviews?.[answerSection(key)]?.status==='approved');
}
export function applicationSignatureApproved(enquiry:any):boolean {
 return applicationDataApproved(enquiry)||enquiry.application_section_reviews?.Declaration?.status==='approved';
}
export function registerApplicationReview(app:Express){
 app.put('/api/tenant-enquiries/:id/document-override',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const {doc_type,overridden}=req.body;
  if(typeof doc_type!=='string'||typeof overridden!=='boolean')return res.status(400).json({error:'Choose a missing document type and override decision'});
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const e=(await c.query('SELECT * FROM tenant_enquiries WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!e||!e.application_form_completed||e.status==='converted'||!requiredApplicationDocuments(e.app_form_data?.employment_status).includes(doc_type)){await c.query('ROLLBACK');return res.status(400).json({error:'Choose a required document type for a submitted application'});}
   if(awaitingApplicationResubmission(e)){await c.query('ROLLBACK');return res.status(409).json({error:'Waiting on tenant. Review can resume after the tenant resubmits.'});}
   if((await c.query("SELECT id FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void'",[[e.id,e.joint_partner_id].filter(Boolean)])).rowCount){await c.query('ROLLBACK');return res.status(409).json({error:'Void the issued agreement before changing the application review'});}
   if(overridden&&(await c.query("SELECT id FROM documents WHERE entity_type='tenant_enquiry' AND entity_id=$1 AND doc_type=$2",[e.id,doc_type])).rowCount){await c.query('ROLLBACK');return res.status(409).json({error:'This document type has been uploaded. Review the document instead.'});}
   const overrides={...e.application_document_overrides};
   if(overridden)overrides[doc_type]={status:'overridden',reviewed_at:new Date().toISOString(),reviewed_by:req.user.id};else delete overrides[doc_type];
   await c.query(`UPDATE tenant_enquiries SET application_document_overrides=$1,application_section_reviews=${retainApprovedAnswersSql},application_review_status='pending',application_reviewed_at=NULL,application_reviewed_by=NULL WHERE id=$2`,[JSON.stringify(overrides),e.id]);
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'application_document_override','tenant_enquiry',$3,$4)",[req.user.id,req.user.email,e.id,JSON.stringify({doc_type,overridden})]);
   await c.query('COMMIT');res.json({overrides});
  }catch{await c.query('ROLLBACK');res.status(500).json({error:'Document override could not be saved'});}finally{c.release();}
 });
 app.put('/api/tenant-enquiries/:id/section-review',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const {section,status}=req.body;const reason=String(req.body.reason||'').trim();
  if(!['pending','approved','rejected'].includes(status)||reason.length>4000||(status==='rejected'&&!reason))return res.status(400).json({error:'Choose a decision and provide a reason for rejection'});
  const c=await pool.connect();try{await c.query('BEGIN');const e=(await c.query('SELECT * FROM tenant_enquiries WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!e||!e.application_form_completed||(section!==APPLICATION_DETAILS&&!answerSections(e.app_form_data).includes(section))){await c.query('ROLLBACK');return res.status(400).json({error:'Choose a submitted application section'});}
   if(awaitingApplicationResubmission(e)){await c.query('ROLLBACK');return res.status(409).json({error:'Waiting on tenant. Review can resume after the tenant resubmits.'});}
   if((await c.query("SELECT id FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void'",[[e.id,e.joint_partner_id].filter(Boolean)])).rowCount){await c.query('ROLLBACK');return res.status(409).json({error:'Void the issued agreement before changing the application review'});}
   const existing={...e.application_section_reviews};
   if(section!==APPLICATION_DETAILS&&(existing[APPLICATION_DETAILS]?.status==='approved'||e.application_review_status==='approved')){
    for(const name of answerSections(e.app_form_data))if(!existing[name])existing[name]={status:'approved',reviewed_at:e.application_reviewed_at,reviewed_by:e.application_reviewed_by};
   }
   if(section!==APPLICATION_DETAILS)delete existing[APPLICATION_DETAILS];
   const reviews={...(section===APPLICATION_DETAILS?{}:existing),[section]:{status,reason:status==='rejected'?reason:null,reviewed_at:new Date().toISOString(),reviewed_by:req.user.id}};
   await c.query("UPDATE tenant_enquiries SET application_section_reviews=$1,application_review_status='pending',application_reviewed_at=NULL,application_reviewed_by=NULL,application_changes_sent_at=NULL WHERE id=$2",[JSON.stringify(reviews),e.id]);
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'application_section_review','tenant_enquiry',$3,$4)",[req.user.id,req.user.email,e.id,JSON.stringify({section,status,reason})]);
   await c.query('COMMIT');res.json({reviews});
  }catch{await c.query('ROLLBACK');res.status(500).json({error:'Section review could not be saved'});}finally{c.release();}
 });
 app.post('/api/tenant-enquiries/:id/application-review/email-preview',authMiddleware,async(req,res)=>{
  const e=await queryOne('SELECT first_name_1,application_form_slug,application_form_token,app_form_data,application_document_overrides FROM tenant_enquiries WHERE id=$1',[req.params.id]);if(!e)return res.sendStatus(404);
  const docs=await query("SELECT doc_type FROM documents WHERE entity_type='tenant_enquiry' AND entity_id=$1",[req.params.id]);
  res.json(applicationChangesRequestedEmail(e.first_name_1,includeMissingDocumentRequests(String(req.body.changes_required||''),e.app_form_data?.employment_status,docs,e.application_document_overrides),`https://apply.fleminglettings.co.uk/${e.application_form_slug||e.application_form_token}`));
 });
}
