import {describe,it,expect} from 'vitest';
import {applicationReviewSections,onboardingReviewNotes} from './applicationReview';

describe('application review answers',()=>{
  it('groups income thousands without changing phone or account numbers',()=>{
    const answers=applicationReviewSections({app_form_data:{gross_annual_income:'36000',additional_income_amount:1250.5,phone:'07700900184',bank_account_number:'12345678'}}).flatMap(section=>section.answers);
    expect(answers.find(answer=>answer.key==='gross_annual_income')?.value).toBe('36,000');
    expect(answers.find(answer=>answer.key==='additional_income_amount')?.value).toBe('1,250.5');
    expect(answers.find(answer=>answer.key==='phone')?.value).toBe('07700900184');
    expect(answers.find(answer=>answer.key==='bank_account_number')?.value).toBe('12345678');
  });
  it('retains false and zero and renders structured answers',()=>{
    const sections=applicationReviewSections({app_form_data:{has_loans:false,gross_annual_income:0,joint_applicants:[{name:'Test Person'}]}});
    expect(sections.find(s=>s.title==='Financial Details')?.answers.map(a=>a.value)).toEqual(['No','0']);
    expect(sections[0].answers[0].value).toBe('Name: Test Person');
  });
  it('places financials, employment, references and contacts in their sections',()=>{
    const sections=applicationReviewSections({app_form_data:{employer_name:'Test Ltd',gross_annual_income:'36000',employer_reference_name:'Ref',bank_account_name:'Test',has_guarantor:false,next_of_kin_name:'Kin',current_address_city:'Test City'}});
    expect(sections.map(s=>s.title)).toEqual(['Address & Landlord','Employment & Income','Financial Details','References','Bank Details','Next of Kin','Guarantor']);
  });
  it('uses stored enquiry details only as fallbacks and excludes workflow metadata',()=>{
    const sections=applicationReviewSections({app_form_data:{first_name:'Submitted',phone:''},first_name_1:'Old',phone_1:'123',app_next_of_kin_name:'Kin',application_form_token:'secret',status:'onboarding'});
    expect(sections.flatMap(s=>s.answers).map(a=>a.value)).toEqual(['Submitted','Kin']);
  });
});

describe('previous onboarding notes',()=>{
 it('retains notes from earlier reviews in newest-first order without mixing in unrelated notes',()=>{
  const notes=[{id:'application-review-1',text:'Check the address.',author:'Agent One',created_at:'2026-09-25T10:00:00Z'},{id:'general-note',text:'Unrelated note',created_at:'2026-09-26T10:00:00Z'},{id:'application-review-2',text:'Check the replacement ID.',author:'Agent Two',created_at:'2026-09-26T09:00:00Z'}];
  expect(onboardingReviewNotes(JSON.stringify(notes)).map(n=>n.text)).toEqual(['Check the replacement ID.','Check the address.']);
 });
 it('uses the saved request as a fallback without duplicating an existing note',()=>{
  const request={internal_notes:'Check the address.',requested_at:'2026-09-25T10:00:00Z'};
  expect(onboardingReviewNotes('invalid',request)).toHaveLength(1);
  expect(onboardingReviewNotes([{id:'application-review-1',text:'Check the address.',author:'Agent',created_at:'2026-09-25T10:00:00Z'}],request)).toHaveLength(1);
  expect(onboardingReviewNotes(null)).toEqual([]);
 });
});
