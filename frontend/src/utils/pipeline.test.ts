import {it,expect} from 'vitest';
import {applicationReadyForReview,guarantorPipelineState,pipelineVisible,pipelineStage,matchesPipelineAgent} from './pipeline';
it('resurfaces submitted joint applications only when both are ready, including after a revision',()=>{
 const one={status:'onboarding',joint_partner_id:84,application_form_completed:1,application_review_status:'approved',follow_up_date:'2026-10-10'};
 const other={status:'onboarding',application_form_completed:1,application_review_status:'pending'};
 expect(applicationReadyForReview(one)).toBe(false);
 expect(applicationReadyForReview(one,{...other,application_form_completed:0})).toBe(false);
 expect(applicationReadyForReview(one,other)).toBe(true);
 expect(applicationReadyForReview(one,{...other,application_review_status:'approved'})).toBe(false);
 expect(applicationReadyForReview(one,{...other,application_review_status:'changes_requested',application_changes_sent_at:'2026-09-29'})).toBe(false);
 const ready={...one,ready_for_review:applicationReadyForReview(one,other)};
 expect(pipelineVisible(ready,'2026-09-29')).toBe(true);
 expect(pipelineStage(ready,'2026-09-29')).toBe('Ready for Review');
});
it('brings a viewing back only once its appointment is due',()=>{const e={status:'viewing_booked',viewing_date:'2026-09-23',viewing_time:'14:30'};expect(pipelineVisible(e,'2026-09-22','16:00')).toBe(false);expect(pipelineVisible(e,'2026-09-23','14:29')).toBe(false);expect(pipelineVisible(e,'2026-09-23','14:30')).toBe(true);expect(pipelineVisible(e,'2026-09-24')).toBe(true);});
it('hides future handovers but leaves a due handover actionable',()=>{const e={status:'onboarding',balance_payment_received:1,tenancy_agreement_status:'completed',handover_date:'2026-09-24'};expect(pipelineVisible(e,'2026-09-23')).toBe(false);expect(pipelineVisible(e,'2026-09-24')).toBe(true);expect(pipelineStage(e,'2026-09-24')).toBe('Handover Due');expect(pipelineVisible({...e,status:'converted'},'2026-09-24')).toBe(false);});
it('retains balance follow-up dates and actionable new enquiries',()=>{expect(pipelineVisible({status:'new'},'2026-09-22')).toBe(true);expect(pipelineVisible({status:'onboarding',balance_payment_requested:1,balance_follow_up_date:'2026-09-24'},'2026-09-22')).toBe(false);});

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

it('hides future follow-ups until due but resurfaces completed agreements',()=>{
 const enquiry={status:'awaiting_response',follow_up_date:'2026-09-25'};
 expect(pipelineVisible(enquiry,'2026-09-23')).toBe(false);
 expect(pipelineVisible(enquiry,'2026-09-25')).toBe(true);
 expect(pipelineVisible({...enquiry,tenancy_agreement_status:'completed'},'2026-09-23')).toBe(true);
 expect(pipelineStage({...enquiry,tenancy_agreement_status:'completed'},'2026-09-23')).toBe('Agreement Signed');
});

it('waits for the guarantor, then resurfaces a signed submission despite a future follow-up',()=>{
 const base={status:'onboarding',application_form_completed:1,application_review_status:'approved',guarantor_required:true,follow_up_date:'2026-12-01'};
 const waiting={...base,guarantor_pipeline_action:'waiting' as const};
 expect(pipelineVisible({...waiting,guarantor_pipeline_state:guarantorPipelineState(waiting)},'2026-10-14')).toBe(false);
 const review={...base,guarantor_pipeline_action:'review' as const};
 const ready={...review,guarantor_pipeline_state:guarantorPipelineState(review)};
 expect(pipelineVisible(ready,'2026-10-14')).toBe(true);
 expect(pipelineStage(ready,'2026-10-14')).toBe('Guarantor Ready for Review');
 expect(pipelineVisible({...ready,status:'converted'},'2026-10-14')).toBe(false);
 expect(guarantorPipelineState({...base,guarantor_pipeline_action:'complete'})).toBe(null);
 expect(guarantorPipelineState({...base,guarantor_required:false})).toBe(null);
 expect(guarantorPipelineState({...base,application_review_status:'pending'})).toBe(null);
 expect(guarantorPipelineState(base)).toBe('action');
});
it('keeps joint office work visible when the other guarantor is still outstanding',()=>{
 const base={status:'onboarding',application_review_status:'approved',guarantor_required:true};
 const first={...base,joint_partner_id:2,guarantor_pipeline_action:'waiting' as const};
 expect(guarantorPipelineState(first,{...base,guarantor_pipeline_action:'waiting'})).toBe('waiting');
 expect(guarantorPipelineState(first,{...base,guarantor_pipeline_action:'review'})).toBe('review');
 expect(guarantorPipelineState(first,base)).toBe('action');
 expect(guarantorPipelineState(first,{...base,application_review_status:'pending'})).toBe(null);
});
