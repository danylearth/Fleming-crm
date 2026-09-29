import {expect,it,vi} from 'vitest';
vi.mock('./db-pg',()=>({default:{},query:vi.fn(),queryOne:vi.fn()}));
vi.mock('./email',()=>({applicationChangesRequestedEmail:vi.fn()}));
import {approvedDataChanged,approvedAnswerKeys,applicationDataApproved,applicationSignatureApproved,answerSections} from './application-review';
import {applicationReviewSections} from '../../frontend/src/utils/applicationReview';
const enquiry={app_form_data:{first_name:'Jamie',employment_status:'Employed',employer_name:'Example',gross_annual_income:'30000',next_of_kin_name:'Morgan',has_employer_reference:true,employer_reference_name:'Referee'},application_section_reviews:{'Personal Details':{status:'approved'},'Next of Kin':{status:'approved'}}};
it('locks approved sections while allowing other answers to be revised',()=>{
 expect(approvedDataChanged(enquiry,{...enquiry.app_form_data,employer_name:'New employer'})).toBe(false);
 expect(approvedDataChanged(enquiry,{...enquiry.app_form_data,first_name:'Other'})).toBe(true);
 expect(approvedDataChanged(enquiry,{...enquiry.app_form_data,next_of_kin_name:'Other'})).toBe(true);
 expect(approvedDataChanged(enquiry,{...enquiry.app_form_data,last_name:'Added'})).toBe(true);
 expect(approvedAnswerKeys(enquiry)).toEqual(['first_name','next_of_kin_name']);
 expect(applicationDataApproved(enquiry)).toBe(false);
 expect(applicationSignatureApproved(enquiry)).toBe(false);
 expect(applicationSignatureApproved({...enquiry,application_section_reviews:{Declaration:{status:'approved'}}})).toBe(true);
});
it('requires every submitted section, including structured answers, and preserves legacy overall approvals',()=>{
 const data={...enquiry.app_form_data,previous_addresses:[{address:'Old address'}]};
 const sections=answerSections(data);
 expect(sections).toContain('Address & Landlord');expect(sections).toContain('References');expect(sections).toContain('Financial Details');
 expect([...sections].sort()).toEqual(applicationReviewSections({app_form_data:data}).map(s=>s.title).sort());
 const approved={app_form_data:data,application_section_reviews:Object.fromEntries(sections.map(s=>[s,{status:'approved'}]))};
 expect(applicationDataApproved(approved)).toBe(true);
 expect(approvedDataChanged({...enquiry,application_section_reviews:{'Application Details':{status:'approved'}}},{...enquiry.app_form_data,employer_name:'Changed'})).toBe(true);
});
