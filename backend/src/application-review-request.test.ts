import {expect,it} from 'vitest';
import {awaitingApplicationResubmission,createApplicationReviewRequest} from './application-review-request';
it('locks sent requests until resubmission, but allows failed or unsent requests to be retried',()=>{
  expect(awaitingApplicationResubmission({application_review_status:'changes_requested',application_changes_sent_at:'2026-09-26'})).toBe(true);
  expect(awaitingApplicationResubmission({application_review_status:'changes_requested'})).toBe(false);
  expect(awaitingApplicationResubmission({application_review_status:'pending',application_changes_sent_at:'2026-09-26'})).toBe(false);
});
it('snapshots pending items and keeps internal notes separate from tenant instructions',()=>{
  const e={app_form_data:{employment_status:'Employed'},application_section_reviews:{'Application Details':{status:'rejected',reason:'Correct your address.'}}};
  const docs=[{id:1,doc_type:'Primary Identification',review_status:'rejected',review_notes:'Upload a clear copy.'},{id:2,doc_type:'Secondary Identification',review_status:'approved'},{id:3,doc_type:'Proof of Income or Employment',review_status:'approved'}];
  const snapshot=createApplicationReviewRequest(e,docs,'Internal only','Primary Identification: Upload a clear copy.','2026-09-26');
  expect(snapshot.items.map(i=>i.label)).toEqual(['Application Details','Primary Identification','Bank Statements']);
  expect(snapshot.items[2].reason).toBe('Please also provide three months’ bank statements.');
  expect(snapshot.internal_notes).toBe('Internal only');
  expect(snapshot.changes_required).not.toContain('Internal only');
  docs[0].review_notes='Changed afterwards';
  expect(snapshot.items[1].reason).toBe('Upload a clear copy.');
});
