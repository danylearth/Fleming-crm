import {it,expect} from 'vitest';
import {tenantPipelineRecord,tenantPipelineAction,applicationReadyForReview,guarantorPipelineState,landlordEnquiryAction,landlordServiceAction,matchesPipelineAgent,type PipelineEnquiry} from './pipeline';
const today='2026-10-14';
const approved:PipelineEnquiry={status:'onboarding',holding_deposit_requested:1,holding_deposit_received:1,application_form_sent:1,application_form_completed:1,application_review_status:'approved',guarantor_required:false,credit_check_completed:1};
const action=(overrides:Partial<PipelineEnquiry>,partner?:PipelineEnquiry)=>tenantPipelineAction(tenantPipelineRecord({...approved,...overrides},partner),today,'14:00');
it('walks every new-tenant stage through office work, external waits and completion',()=>{
 expect(action({holding_deposit_received:0,holding_deposit_requested:0,application_form_completed:0,application_form_sent:0})).toBe('Request Holding Deposit');
 expect(action({holding_deposit_received:0,application_form_completed:0})).toBe(null);
 expect(action({holding_deposit_received:0,application_form_completed:0,follow_up_date:today})).toBe('Holding Deposit Follow-up Due');
 expect(action({application_form_sent:0,application_form_completed:0})).toBe('Send Application');
 expect(action({application_form_completed:0})).toBe(null);
 expect(action({application_review_status:'pending',follow_up_date:'2027-01-01'})).toBe('Ready for Review');
 expect(action({application_review_status:'changes_requested',application_changes_sent_at:'2026-10-13'})).toBe(null);
 expect(action({application_review_status:'changes_requested'})).toBe('Ready for Review');
 expect(action({guarantor_required:null})).toBe('Application Review');
 expect(action({credit_check_completed:0})).toBe('Run Credit Check');
 expect(action({})).toBe('Prepare Tenancy Agreement');
 expect(action({tenancy_agreement_status:'issued'})).toBe(null);
 expect(action({tenancy_agreement_status:'tenant_signed'})).toBe(null);
 expect(action({tenancy_agreement_status:'issued',follow_up_date:today})).toBe('Agreement Follow-up Due');
 expect(action({tenancy_agreement_status:'completed',follow_up_date:'2027-01-01'})).toBe('Request Final Balance');
 expect(action({tenancy_agreement_status:'completed',balance_payment_requested:1,balance_follow_up_date:'2026-10-15'})).toBe(null);
 expect(action({tenancy_agreement_status:'completed',balance_payment_requested:1,balance_follow_up_date:today})).toBe('Final Balance Follow-up');
 expect(action({tenancy_agreement_status:'completed',balance_payment_received:1})).toBe('Book Handover');
 expect(action({tenancy_agreement_status:'completed',balance_payment_received:1,handover_date:today,handover_time:'15:00'})).toBe(null);
 expect(action({tenancy_agreement_status:'completed',balance_payment_received:1,handover_date:today,handover_time:'14:00'})).toBe('Handover Due');
 expect(action({tenancy_agreement_status:'completed',balance_payment_received:1,handover_not_required:1})).toBe('Ready to Convert');
 for(const status of ['converted','rejected','closed','archived'])expect(action({status,pipeline_follow_up_due:true})).toBe(null);
});
it('existing tenants skip deposit/balance/handover but still require reviews and signing',()=>{
 expect(action({existing_tenancy_application:true,holding_deposit_received:0,application_form_completed:0})).toBe(null);
 expect(action({source_tenant_id:19,holding_deposit_received:0,tenancy_agreement_status:'completed'})).toBe('Complete New Tenancy');
 expect(action({source_tenant_id:19,credit_check_completed:0})).toBe('Run Credit Check');
});
it('guarantors return for submissions or office actions and wait only until an action/follow-up',()=>{
 expect(action({guarantor_required:true,guarantor_pipeline_action:'waiting'})).toBe(null);
 expect(action({guarantor_required:true,guarantor_pipeline_action:'waiting',follow_up_date:today})).toBe('Guarantor Follow-up Due');
 expect(action({guarantor_required:true,guarantor_pipeline_action:'waiting',pipeline_follow_up_due:true})).toBe('Guarantor Follow-up Due');
 expect(action({guarantor_required:true,guarantor_pipeline_action:'review',follow_up_date:'2027-01-01'})).toBe('Guarantor Ready for Review');
 expect(action({guarantor_required:true,guarantor_pipeline_action:'action'})).toBe('Guarantor Review');
 expect(action({guarantor_required:true,guarantor_pipeline_action:'credit'})).toBe('Run Credit Check');
 expect(action({guarantor_required:true,guarantor_pipeline_action:'complete'})).toBe('Prepare Tenancy Agreement');
});
it('joint applicants keep office work visible without treating one submission/signature as complete',()=>{
 const one={...approved,joint_partner_id:2,application_review_status:'pending'};
 expect(applicationReadyForReview(one)).toBe(false);
 expect(applicationReadyForReview(one,{...approved,application_form_completed:0})).toBe(false);
 expect(applicationReadyForReview(one,approved)).toBe(true);
 expect(action({joint_partner_id:2},{...approved,credit_check_completed:0})).toBe('Run Credit Check');
 const waiting={...approved,guarantor_required:true,guarantor_pipeline_action:'waiting' as const};
 expect(guarantorPipelineState({...waiting,joint_partner_id:2},waiting)).toBe('waiting');
 expect(guarantorPipelineState({...waiting,joint_partner_id:2},{...waiting,guarantor_pipeline_action:'review'})).toBe('review');
 expect(action({joint_partner_id:2},{...approved,application_form_completed:0,application_form_sent:0})).toBe('Send Application');
 expect(action({joint_partner_id:2,application_form_completed:0}, {...approved,application_form_completed:0,pipeline_delivery:{tenancy_application:'failed'}})).toBe('Application Delivery Failed');
});
it('failed invitations and delivery resurface while obsolete failures do not block later stages',()=>{
 expect(action({holding_deposit_received:0,application_form_completed:0,pipeline_delivery:{holding_deposit_request:'bounced'}})).toBe('Holding Deposit Request Failed');
 expect(action({application_form_completed:0,pipeline_delivery:{tenancy_application:'failed'}})).toBe('Application Delivery Failed');
 expect(action({tenancy_agreement_status:'issued',tenancy_agreement_action:true})).toBe('Send / Check Agreement Delivery');
 expect(action({tenancy_agreement_status:'completed',balance_payment_requested:1,pipeline_delivery:{final_balance:'failed'}})).toBe('Final Balance Delivery Failed');
 expect(action({pipeline_delivery:{tenancy_application:'failed'}})).toBe('Prepare Tenancy Agreement');
});
it('enquiries and viewings wait until their scheduled UK date and time',()=>{
 const e={status:'viewing_booked',viewing_date:today,viewing_time:'14:30'};
 expect(tenantPipelineAction(e,today,'14:29')).toBe(null);
 expect(tenantPipelineAction(e,today,'14:30')).toBe('Viewing Due');
 expect(tenantPipelineAction({status:'awaiting_response',follow_up_date:'2026-10-15'},today)).toBe(null);
 expect(tenantPipelineAction({status:'awaiting_response',follow_up_date:today},today)).toBe('Follow-up Due');
 expect(tenantPipelineAction({status:'new'},today)).toBe('New');
});
it('landlord enquiries reappear for appointments/follow-ups/failures and stop after conversion',()=>{
 expect(landlordEnquiryAction({status:'new'},today)).toBe('Review New Enquiry');
 const e={status:'follow_up',follow_up_date:today,pipeline_appointment:{kind:'meeting',date:today,time:'15:00'}};
 expect(landlordEnquiryAction(e,today,'14:00')).toBe(null);
 expect(landlordEnquiryAction(e,today,'15:00')).toBe('Meeting Due');
 expect(landlordEnquiryAction({...e,pipeline_appointment:{...e.pipeline_appointment,delivery:{email:{success:false}}}},today,'14:00')).toBe('Appointment Delivery Failed');
 for(const status of ['onboarded','not_interested','closed'])expect(landlordEnquiryAction({...e,status},today)).toBe(null);
});
it('landlord onboarding continues past conversion, hides sent contracts and returns after signing',()=>{
 const e={landlord_id:1,name:'Fictional',property_id:2,kyc_completed:1};
 expect(landlordServiceAction({...e,property_id:undefined})).toBe('Add Property');
 expect(landlordServiceAction(e)).toBe('Prepare Service Contract');
 expect(landlordServiceAction({...e,contract_status:'draft'})).toBe('Send Service Contract');
 expect(landlordServiceAction({...e,contract_status:'issued'})).toBe(null);
 expect(landlordServiceAction({...e,contract_status:'issued',delivery_status:'failed'})).toBe('Service Contract Delivery Failed');
 expect(landlordServiceAction({...e,contract_status:'signed',landlord_approved_at:today})).toBe('Service Contract Signed — Confirm Bank Details');
 expect(landlordServiceAction({...e,contract_status:'signed',landlord_approved_at:today,bank_approved_at:today})).toBe(null);
 expect(landlordServiceAction({...e,contract_status:'signed',kyc_completed:0,has_primary_id:true})).toBe('Review Landlord ID');
 expect(landlordServiceAction({...e,service_override:true})).toBe(null);
 expect(landlordServiceAction({...e,contract_status:'void'})).toBe('Prepare Service Contract');
});
it('filters tenant and landlord rows by agent and retains unassigned only in View All',()=>{
 const members=[{id:3,name:'Sam Fleming'},{id:2,name:'Marie Ellis'}];
 const rows=[{type:'tenant',agent:'Sam Fleming'},{type:'landlord',agent:'Sam Fleming'},{type:'tenant',agent:'Marie Ellis'},{type:'landlord',agent:'—'},{type:'tenant',agent:null}];
 expect(rows.filter(r=>matchesPipelineAgent(r.agent,'all',members))).toHaveLength(5);
 expect(rows.filter(r=>matchesPipelineAgent(r.agent,'3',members)).map(r=>r.type)).toEqual(['tenant','landlord']);
 expect(rows.filter(r=>matchesPipelineAgent(r.agent,'2',members))).toEqual([rows[2]]);
 expect(matchesPipelineAgent('—','99',members)).toBe(false);
});
it('matches workflow agent IDs and legacy names without partial-name matches',()=>{
 const members=[{id:3,name:'Sam Fleming'}];
 for(const agent of [3,'3','Sam Fleming',' sam fleming '])expect(matchesPipelineAgent(agent,'3',members)).toBe(true);
 for(const agent of ['',null,undefined,'Sam','Sam Fleming 2'])expect(matchesPipelineAgent(agent,'3',members)).toBe(false);
});
