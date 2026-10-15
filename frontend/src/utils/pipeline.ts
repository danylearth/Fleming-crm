import {enquiryStageLabel} from './enquiryStage';
export interface PipelineEnquiry {
 status:string;existing_tenancy_application?:unknown;source_tenant_id?:unknown;joint_partner_id?:number;
 viewing_date?:string;viewing_time?:string;handover_date?:string;handover_time?:string;handover_not_required?:number;
 holding_deposit_requested?:number;holding_deposit_received?:number;application_form_sent?:number;
 balance_payment_requested?:number;balance_payment_received?:number;balance_follow_up_date?:string;follow_up_date?:string;
 tenancy_agreement_status?:string;tenancy_agreement_action?:boolean;credit_check_completed?:number;
 application_form_completed?:number|boolean;application_review_status?:string;application_changes_sent_at?:string;
 ready_for_review?:boolean;guarantor_required?:boolean|null;guarantor_pipeline_action?:'waiting'|'review'|'action'|'credit'|'complete'|null;
 guarantor_pipeline_state?:'waiting'|'review'|'action'|'credit'|null;pipeline_delivery?:Record<string,string>;
 application_pipeline_state?:'send'|'waiting'|'review'|'decision'|'complete';all_credit_complete?:boolean;
 pipeline_follow_up_due?:boolean;
}
const flag=(v:unknown)=>v===true||v===1||v==='1';
const closed=(status:string)=>['converted','rejected','not_interested','closed','archived','onboarded'].includes(status);
const due=(date:string|undefined,today:string,time='23:59',at?:string)=>!!date&&(date.slice(0,10)<today||date.slice(0,10)===today&&(!at||at.slice(0,5)<=time));
const failed=(status:string|undefined)=>!!status&&['failed','bounced','suppressed','simulated','partial'].includes(status);
export function applicationReadyForReview(e:PipelineEnquiry,partner?:PipelineEnquiry){
 const submitted=(r:PipelineEnquiry|undefined)=>flag(r?.application_form_completed)&&!(r?.application_review_status==='changes_requested'&&r.application_changes_sent_at);
 return submitted(e)&&(!e.joint_partner_id||submitted(partner))&&(e.application_review_status!=='approved'||!!partner&&partner.application_review_status!=='approved');
}
export function guarantorPipelineState(e:PipelineEnquiry,partner?:PipelineEnquiry):PipelineEnquiry['guarantor_pipeline_state']{
 const applicants=[e,...(e.joint_partner_id&&partner?[partner]:[])];
 if(e.status!=='onboarding'||(e.joint_partner_id&&!partner)||applicants.some(a=>a.application_review_status!=='approved'))return null;
 const actions=applicants.filter(a=>a.guarantor_required).map(a=>a.guarantor_pipeline_action||'action');
 if(actions.includes('review'))return 'review';
 if(actions.includes('action'))return 'action';
 if(actions.includes('waiting'))return 'waiting';
 return actions.includes('credit')?'credit':null;
}
export function tenantPipelineRecord<T extends PipelineEnquiry>(e:T,partner?:PipelineEnquiry){
 const applicants=[e,...(e.joint_partner_id&&partner?[partner]:[])];
 const ready=applicationReadyForReview(e,partner);
 const applicationState:PipelineEnquiry['application_pipeline_state']=ready?'review':
  e.joint_partner_id&&!partner?'decision':
  applicants.some(a=>!flag(a.application_form_completed)&&!flag(a.application_form_sent))?'send':
  applicants.some(a=>!flag(a.application_form_completed)||a.application_review_status==='changes_requested'&&a.application_changes_sent_at)?'waiting':
  applicants.some(a=>a.application_review_status!=='approved'||a.guarantor_required==null)?'decision':'complete';
 return {...e,ready_for_review:ready,application_pipeline_state:applicationState,all_credit_complete:applicants.every(a=>flag(a.credit_check_completed)),
  guarantor_pipeline_state:guarantorPipelineState(e,partner),pipeline_delivery:Object.assign({},...applicants.map(a=>a.pipeline_delivery),...applicants.map(a=>Object.fromEntries(Object.entries(a.pipeline_delivery||{}).filter(([,s])=>failed(s)))))};
}
// A single decision drives both visibility and the action label, in workflow order.
export function tenantPipelineAction(e:PipelineEnquiry,today:string,time='23:59'):string|null{
 if(closed(e.status))return null;
 const follow=()=>e.pipeline_follow_up_due||due(e.follow_up_date,today)?'Follow-up Due':null;
 const wait=(label:string)=>follow()?label+' Follow-up Due':null;
 if(e.ready_for_review)return 'Ready for Review';
 if(e.status!=='onboarding'){
  if(e.status==='viewing_booked'&&e.viewing_date)return due(e.viewing_date,today,time,e.viewing_time)?'Viewing Due':follow();
  if(e.follow_up_date)return follow();
  return enquiryStageLabel(e.status.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),e);
 }
 const existing=flag(e.existing_tenancy_application)||Number(e.source_tenant_id)>0;
 if(!existing&&!e.holding_deposit_received){
  if(!e.holding_deposit_requested)return 'Request Holding Deposit';
  if(failed(e.pipeline_delivery?.holding_deposit_request))return 'Holding Deposit Request Failed';
  return wait('Holding Deposit');
 }
 if(e.application_pipeline_state==='send')return 'Send Application';
 if(e.application_pipeline_state==='waiting'){
  if(failed(e.pipeline_delivery?.tenancy_application)||failed(e.pipeline_delivery?.application_changes_requested))return 'Application Delivery Failed';
  return wait('Application');
 }
 if(e.application_pipeline_state==='decision')return 'Application Review';
 if(e.guarantor_pipeline_state==='review')return 'Guarantor Ready for Review';
 if(e.guarantor_pipeline_state==='action')return 'Guarantor Review';
 if(e.guarantor_pipeline_state==='waiting')return wait('Guarantor');
 if(e.guarantor_pipeline_state==='credit'||e.all_credit_complete===false)return 'Run Credit Check';
 if(e.tenancy_agreement_status!=='completed'){
  if(!e.tenancy_agreement_status||e.tenancy_agreement_status==='draft')return 'Prepare Tenancy Agreement';
  if(e.tenancy_agreement_action)return 'Send / Check Agreement Delivery';
  return wait('Agreement');
 }
 if(existing)return 'Complete New Tenancy';
 if(!e.balance_payment_received){
  if(!e.balance_payment_requested)return 'Request Final Balance';
  if(failed(e.pipeline_delivery?.final_balance))return 'Final Balance Delivery Failed';
  return due(e.balance_follow_up_date,today)||e.pipeline_follow_up_due?'Final Balance Follow-up':null;
 }
 if(e.handover_not_required)return 'Ready to Convert';
 if(!e.handover_date)return 'Book Handover';
 return due(e.handover_date,today,time,e.handover_time)?'Handover Due':follow();
}
export const pipelineVisible=(e:PipelineEnquiry,today:string,time='23:59')=>tenantPipelineAction(e,today,time)!==null;
export const pipelineStage=(e:PipelineEnquiry,today:string,time='23:59')=>tenantPipelineAction(e,today,time)||'';

export interface LandlordPipelineEnquiry {status:string;follow_up_date?:string;pipeline_follow_up_due?:boolean;pipeline_appointment?:{kind:string;date:string;time?:string;delivery?:Record<string,{success?:boolean;simulated?:boolean}>}}
export function landlordEnquiryAction(e:LandlordPipelineEnquiry,today:string,time='23:59'){
 if(closed(e.status))return null;
 const a=e.pipeline_appointment;
 if(a&&a.date?.slice(0,10)===e.follow_up_date?.slice(0,10)){
  if(Object.values(a.delivery||{}).some(d=>d.success===false||d.simulated))return 'Appointment Delivery Failed';
  return due(a.date,today,time,a.time)?a.kind==='meeting'?'Meeting Due':'Follow-up Due':e.pipeline_follow_up_due?'Follow-up Due':null;
 }
 if(e.pipeline_follow_up_due)return 'Follow-up Due';
 if(e.follow_up_date)return due(e.follow_up_date,today)?'Follow-up Due':null;
 return e.status==='new'?'Review New Enquiry':'Contact / Arrange Next Step';
}
export interface LandlordServiceRecord {landlord_id:number;name:string;property_id?:number;property_address?:string;updated_at?:string;previous_agent?:string;contract_status?:string;delivery_status?:string;signed_at?:string;service_override?:boolean;kyc_completed?:number;has_primary_id?:boolean;bank_approved_at?:string;landlord_approved_at?:string}
export function landlordServiceAction(e:LandlordServiceRecord){
 if(!e.property_id)return 'Add Property';
 if(e.contract_status!=='signed'&&!e.service_override){
  if(failed(e.delivery_status))return 'Service Contract Delivery Failed';
  if(e.contract_status==='issued')return !e.kyc_completed&&e.has_primary_id?'Review Landlord ID':null;
  return e.contract_status==='draft'?'Send Service Contract':'Prepare Service Contract';
 }
 if(e.landlord_approved_at&&!e.bank_approved_at)return 'Service Contract Signed — Confirm Bank Details';
 if(!e.kyc_completed)return e.has_primary_id?'Review Landlord ID':'Request Landlord ID';
 return null;
}

export function matchesPipelineAgent(agent:string|number|null|undefined,selected:string,members:{id:number;name:string}[]){
 if(selected==='all')return true;
 const member=members.find(m=>String(m.id)===selected);
 if(!member||agent==null)return false;
 const value=String(agent).trim().toLowerCase();
 return value===String(member.id)||value===member.name.trim().toLowerCase();
}
