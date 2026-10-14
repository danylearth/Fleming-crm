import {enquiryStageLabel} from './enquiryStage';
interface PipelineEnquiry {status:string;existing_tenancy_application?:unknown;source_tenant_id?:unknown;viewing_date?:string;viewing_time?:string;handover_date?:string;handover_not_required?:number;balance_payment_requested?:number;balance_payment_received?:number;balance_follow_up_date?:string;follow_up_date?:string;tenancy_agreement_status?:string;application_form_completed?:number|boolean;application_review_status?:string;application_changes_sent_at?:string;ready_for_review?:boolean;guarantor_required?:boolean|null;guarantor_pipeline_action?:'waiting'|'review'|'action'|'complete'|null;guarantor_pipeline_state?:'waiting'|'review'|'action'|null}
export function applicationReadyForReview(e:PipelineEnquiry & {joint_partner_id?:number},partner?:PipelineEnquiry){
 const submitted=(r:PipelineEnquiry|undefined)=>!!r?.application_form_completed&&!(r.application_review_status==='changes_requested'&&r.application_changes_sent_at);
 return submitted(e)&&(!e.joint_partner_id||submitted(partner))&&(e.application_review_status!=='approved'||!!partner&&partner.application_review_status!=='approved');
}
// A joint application can still need office attention for the other applicant.
export function guarantorPipelineState(e:PipelineEnquiry & {joint_partner_id?:number},partner?:PipelineEnquiry):PipelineEnquiry['guarantor_pipeline_state']{
 const applicants=[e,...(e.joint_partner_id&&partner?[partner]:[])];
 if(e.status!=='onboarding'||(e.joint_partner_id&&!partner)||applicants.some(a=>a.application_review_status!=='approved'))return null;
 const actions=applicants.filter(a=>a.guarantor_required).map(a=>a.guarantor_pipeline_action||'action');
 if(actions.includes('review'))return 'review';
 if(actions.includes('action'))return 'action';
 return actions.includes('waiting')?'waiting':null;
}
export function pipelineVisible(e:PipelineEnquiry,today:string,time='00:00'){
 if(['converted','rejected','not_interested','closed','archived'].includes(e.status))return false;
 if(e.ready_for_review)return true;
 if(e.guarantor_pipeline_state==='review'||e.guarantor_pipeline_state==='action')return true;
 if(e.guarantor_pipeline_state==='waiting')return false;
 if(e.balance_payment_received&&!e.handover_not_required&&e.handover_date)return e.handover_date.slice(0,10)<=today;
 if(e.status==='viewing_booked'&&e.viewing_date){const day=e.viewing_date.slice(0,10);return day<today||(day===today&&(!e.viewing_time||e.viewing_time.slice(0,5)<=time));}
 if(e.balance_payment_requested&&!e.balance_payment_received)return !!e.balance_follow_up_date&&e.balance_follow_up_date.slice(0,10)<=today;
 if(e.tenancy_agreement_status==='completed')return true;
 if(e.follow_up_date&&e.follow_up_date.slice(0,10)>today)return false;
 return !e.tenancy_agreement_status||e.tenancy_agreement_status==='completed'||!!(e.follow_up_date&&e.follow_up_date.slice(0,10)<=today);
}
export function pipelineStage(e:PipelineEnquiry,today:string){
 if(e.ready_for_review)return 'Ready for Review';
 if(e.guarantor_pipeline_state==='review')return 'Guarantor Ready for Review';
 if(e.guarantor_pipeline_state==='action')return 'Guarantor Review';
 if(e.balance_payment_received)return e.handover_not_required?'Ready to Convert':e.handover_date?'Handover Due':'Book Handover';
 if(e.balance_payment_requested)return 'Final Balance Follow-up';
 if(e.tenancy_agreement_status==='completed')return 'Agreement Signed';
 if(e.application_form_completed)return e.application_review_status==='approved'?'Application Approved':'Application Completed';
 if(e.status==='viewing_booked')return 'Viewing Booked';
 if(e.follow_up_date&&e.follow_up_date.slice(0,10)<=today)return 'Follow-up Due';
 return enquiryStageLabel(e.status.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),e);
}

export function matchesPipelineAgent(agent:string|number|null|undefined,selected:string,members:{id:number;name:string}[]){
 if(selected==='all')return true;
 const member=members.find(m=>String(m.id)===selected);
 if(!member||agent==null)return false;
 const value=String(agent).trim().toLowerCase();
 return value===String(member.id)||value===member.name.trim().toLowerCase();
}
