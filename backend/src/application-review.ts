import type {Express} from 'express';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import pool,{queryOne} from './db-pg';
import {applicationChangesRequestedEmail} from './email';
export const answerSection=(key:string)=> /^(bank|sort_code|account_)/.test(key)?'Bank Details':/^(nok|next_of_kin)/.test(key)?'Next of Kin':/^(guarantor)/.test(key)?'Guarantor':/^(employ|income|job|student)/.test(key)?'Employment & Income':/^(landlord|agent|current_|previous_)/.test(key)?'Address & Landlord':/^(rent|deposit|preferred|tenancy|forwarding|parking|pet|smok)/.test(key)?'Tenancy Details':/^(declar|sign|consent)/.test(key)?'Declaration':'Personal Details';
export function answerSections(data:Record<string,unknown>){return [...new Set(Object.entries(data||{}).filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!==''&&!Array.isArray(v)&&typeof v!=='object').map(([k])=>answerSection(k)))];}
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
 if(!applicationDataApproved(enquiry))return false;
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
 return [...new Set([...Object.keys(original),...Object.keys(submitted)])].some(key=>!same(original[key],submitted[key]));
}
export function registerApplicationReview(app:Express){
 app.put('/api/tenant-enquiries/:id/section-review',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const {section,status}=req.body;const reason=String(req.body.reason||'').trim();
  if(!['approved','rejected'].includes(status)||reason.length>4000||(status==='rejected'&&!reason))return res.status(400).json({error:'Choose a decision and provide a reason for rejection'});
  const c=await pool.connect();try{await c.query('BEGIN');const e=(await c.query('SELECT * FROM tenant_enquiries WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!e||!e.application_form_completed||(section!==APPLICATION_DETAILS&&!answerSections(e.app_form_data).includes(section))){await c.query('ROLLBACK');return res.status(400).json({error:'Choose a submitted application section'});}
   if((await c.query("SELECT id FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void'",[[e.id,e.joint_partner_id].filter(Boolean)])).rowCount){await c.query('ROLLBACK');return res.status(409).json({error:'Void the issued agreement before changing the application review'});}
   const reviews={...(section===APPLICATION_DETAILS?{}:e.application_section_reviews),[section]:{status,reason:status==='rejected'?reason:null,reviewed_at:new Date().toISOString(),reviewed_by:req.user.id}};
   await c.query("UPDATE tenant_enquiries SET application_section_reviews=$1,application_review_status='pending',application_reviewed_at=NULL,application_reviewed_by=NULL,application_changes_sent_at=NULL WHERE id=$2",[JSON.stringify(reviews),e.id]);
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'application_section_review','tenant_enquiry',$3,$4)",[req.user.id,req.user.email,e.id,JSON.stringify({section,status,reason})]);
   await c.query('COMMIT');res.json({reviews});
  }catch{await c.query('ROLLBACK');res.status(500).json({error:'Section review could not be saved'});}finally{c.release();}
 });
 app.post('/api/tenant-enquiries/:id/application-review/email-preview',authMiddleware,async(req,res)=>{
  const e=await queryOne('SELECT first_name_1,application_form_slug,application_form_token FROM tenant_enquiries WHERE id=$1',[req.params.id]);if(!e)return res.sendStatus(404);
  res.json(applicationChangesRequestedEmail(e.first_name_1,String(req.body.changes_required||''),`https://apply.fleminglettings.co.uk/${e.application_form_slug||e.application_form_token}`));
 });
}
