import {it,expect} from 'vitest';
import {pipelineVisible,pipelineStage,matchesPipelineAgent} from './pipeline';
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
