import {describe,it,expect} from 'vitest';
import {normaliseAgreementAccount,sameAgreementAccount,confirmedAgreementPayment,defaultAgreementPaymentInstructions} from './agreement-payment-confirmation';
import {bankDetailsForRoute,resolvePaymentRoute} from './tenancy-agreement-pdf';
const account={accountName:'Fictional Account',sortCode:'12-34-56',accountNumber:'12345678',bankName:'Test Bank'};
describe('agreement payment confirmation',()=>{
 it.each(['full_management','rent_collection'])('directs all %s payments to client money, with only agreed fees transferred to business',service=>{
  expect(defaultAgreementPaymentInstructions(service)).toBe('Initial rental payment and holding deposit is paid into Fleming Lettings client money account. Future payments continue to be paid into the client money account.');
 });
 it('selects Fleming client money for rent collection and full management and landlord details for let only',()=>{
  expect(resolvePaymentRoute('client','full_management')).toBe('fleming_client_money');expect(resolvePaymentRoute('client','rent_collection')).toBe('fleming_client_money');
  expect(resolvePaymentRoute('client','let_only')).toBe('landlord');expect(bankDetailsForRoute('landlord',account)).toEqual(account);
 });
 it('normalises a valid account and rejects incomplete overrides',()=>{
  expect(normaliseAgreementAccount({...account,sortCode:'123456'})).toEqual(account);
  expect(()=>normaliseAgreementAccount({...account,accountNumber:'123'})).toThrow();
 });
 it('requires new confirmation when the service or suggested account changes',()=>{
  const saved={account,serviceType:'let_only',confirmedAt:'2026-09-29',override:false};
  expect(confirmedAgreementPayment(saved,'let_only',account)).toEqual(account);
  expect(confirmedAgreementPayment(saved,'full_management',account)).toBeNull();
  expect(confirmedAgreementPayment(saved,'let_only',{...account,accountNumber:'87654321'})).toBeNull();
  expect(confirmedAgreementPayment({...saved,confirmedAt:null},'let_only',account)).toBeNull();
 });
 it('keeps an explicitly confirmed override on this agreement without changing the suggested account',()=>{
  const suggested={...account,accountNumber:'87654321'};
  expect(sameAgreementAccount(account,suggested)).toBe(false);
  expect(confirmedAgreementPayment({account,serviceType:'full_management',confirmedAt:'2026-09-29',override:true},'full_management',suggested)).toEqual(account);
  expect(suggested.accountNumber).toBe('87654321');
 });
});
