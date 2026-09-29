import {describe,it,expect} from 'vitest';
import {creditChecksComplete,isValidCreditScore} from './creditChecks';

it('requires a whole numeric score, including zero, rather than a rating or blank',()=>{
 for(const value of ['',' ','GOOD','720.5','-1','NaN','1e3','9007199254740992']) expect(isValidCreditScore(value)).toBe(false);
 for(const value of ['0','720',' 720 ']) expect(isValidCreditScore(value)).toBe(true);
});

describe('credit check progression',()=>{
 it('requires a completed credit check for a single applicant',()=>{
  expect(creditChecksComplete({credit_check_completed:0})).toBe(false);
  expect(creditChecksComplete({credit_check_completed:1})).toBe(true);
 });
 it('requires both joint applicants and does not accept an unrelated or unloaded partner',()=>{
  const applicant={id:83,joint_partner_id:84,credit_check_completed:1};
  expect(creditChecksComplete(applicant)).toBe(false);
  expect(creditChecksComplete(applicant,{id:84,credit_check_completed:0})).toBe(false);
  expect(creditChecksComplete(applicant,{id:85,credit_check_completed:1})).toBe(false);
  expect(creditChecksComplete(applicant,{id:84,credit_check_completed:1})).toBe(true);
  expect(creditChecksComplete({...applicant,credit_check_completed:0},{id:84,credit_check_completed:1})).toBe(false);
 });
});
