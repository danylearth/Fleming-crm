import {it,expect} from 'vitest';
import {assertGuarantorReviewComplete,guarantorReviewSections,guarantorReviewDecision,guarantorRequestedChanges,resubmitGuarantorCorrections} from './guarantor-review';
import {guarantorEvidenceCategories} from './guarantor-evidence';
const files=()=>guarantorEvidenceCategories.slice(0,4).map(category=>({category,review_status:'approved'}));
const record=()=>({status:'submitted',signature:{},workflow:{sections:Object.fromEntries(guarantorReviewSections.map(title=>[title,{status:'approved'}])),reviewStatus:'approved'}});
it('requires signed evidence, all section decisions and supporting documents',()=>{
 const g=record();expect(()=>assertGuarantorReviewComplete(g,files())).not.toThrow();
 expect(()=>assertGuarantorReviewComplete({...g,signature:null},files())).toThrow();
 expect(()=>assertGuarantorReviewComplete(g,files().slice(1))).toThrow();
 expect(()=>assertGuarantorReviewComplete(g,[...files(),{category:'Employment Reference',review_status:'pending'}])).toThrow();
 expect(()=>assertGuarantorReviewComplete({...g,workflow:{...g.workflow,deedNeedsResigning:true}},files())).toThrow();
});
it('saves a rejected section without resetting unrelated approvals',()=>{
 const next=guarantorReviewDecision(record(),'Personal Details','rejected','Correct your date of birth',7);
 expect(next.sections['Personal Details'].status).toBe('rejected');expect(next.sections.References.status).toBe('approved');expect(next.reviewStatus).toBe('pending');
 expect(()=>guarantorReviewDecision(record(),'Personal Details','rejected','',7)).toThrow();
 expect(guarantorRequestedChanges({workflow:next},files())).toBe('Personal Details: Correct your date of birth');
});
it('only reopens the corrected sections while retaining approved answers and signed history',()=>{
 const workflow={...guarantorReviewDecision(record(),'Personal Details','rejected','Correct your date of birth',7),reviewStatus:'changes_requested',changesSent:'2026-10-05',revisionEdits:['Personal Details']};
 const g={...record(),status:'changes_requested',workflow},next=resubmitGuarantorCorrections(g,files());
 expect(next.sections['Personal Details'].status).toBe('pending');expect(next.sections.References.status).toBe('approved');expect(next.reviewStatus).toBe('pending');expect(g.signature).toEqual({});
 expect(()=>resubmitGuarantorCorrections({...g,workflow:{...workflow,revisionEdits:[]}},files())).toThrow(/every requested/);
 expect(()=>resubmitGuarantorCorrections(g,files().map(file=>({...file,review_status:'rejected'})))).toThrow(/Replace every/);
});
