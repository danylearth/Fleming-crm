import {expect,it} from 'vitest';
import {guarantorRequirementReady,guarantorApplicationReady} from './guarantor-validation';

it('allows a requirement decision on a submitted application while office review is pending',()=>{
 const enquiry={status:'onboarding',application_form_completed:1,application_review_status:'pending'};
 expect(guarantorRequirementReady(enquiry)).toBe(true);
 expect(guarantorApplicationReady(enquiry)).toBe(false);
 expect(guarantorApplicationReady({...enquiry,application_review_status:'approved'})).toBe(true);
});
it('does not allow decisions for unsubmitted, rejected or converted applications',()=>{
 expect(guarantorRequirementReady({status:'onboarding',application_form_completed:0})).toBe(false);
 for(const status of ['rejected','converted','closed','archived'])expect(guarantorRequirementReady({status,application_form_completed:1})).toBe(false);
});
