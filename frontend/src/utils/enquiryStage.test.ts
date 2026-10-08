import {describe,it,expect} from 'vitest';
import {enquiryStageLabel,onboardingCardStage} from './enquiryStage';
describe('existing tenant onboarding stage',()=>{
 it('distinguishes an existing tenant starting a new onboarding',()=>{
  expect(enquiryStageLabel('New',{existing_tenancy_application:1})).toBe('Existing Tenant - New Onboarding');
  expect(enquiryStageLabel('New',{source_tenant_id:37})).toBe('Existing Tenant - New Onboarding');
 });
 it('preserves new applicants and stages already in progress',()=>{
  expect(enquiryStageLabel('New',{existing_tenancy_application:'0'})).toBe('New');
  expect(enquiryStageLabel('Awaiting Signature',{existing_tenancy_application:true})).toBe('Awaiting Signature');
 });
});

describe('current onboarding card step',()=>{
 it('shows returned applications and completed agreements',()=>{
  expect(onboardingCardStage({status:'onboarding',application_form_completed:1,application_review_status:'pending'})).toBe('Application Ready for Review');
  expect(onboardingCardStage({status:'onboarding',tenancy_agreement_status:'completed',onboarding_stage:'Final Balance'})).toBe('Tenancy Agreement Signed');
 });
 it('does not describe a joint application or requested changes as ready prematurely',()=>{
  expect(onboardingCardStage({status:'onboarding',application_form_completed:1,joint_partner_id:2,onboarding_stage:'Application Form'},{application_form_completed:0})).toBe('Application Form');
  expect(onboardingCardStage({status:'onboarding',application_form_completed:1,application_review_status:'changes_requested',application_changes_sent_at:'2026-10-07'})).toBe('Awaiting Application Changes');
 });
 it('uses later financial steps once the signed agreement has progressed',()=>{
  expect(onboardingCardStage({status:'onboarding',tenancy_agreement_completed:true,balance_payment_requested:1})).toBe('Awaiting Final Balance');
  expect(onboardingCardStage({status:'onboarding',balance_payment_received:1,onboarding_stage:'Schedule Handover'})).toBe('Schedule Handover');
  expect(onboardingCardStage({status:'converted',tenancy_agreement_completed:true})).toBeUndefined();
 });
});
