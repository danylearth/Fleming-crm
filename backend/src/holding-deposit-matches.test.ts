import {describe,it,expect} from 'vitest';
import {holdingDepositMatch} from './holding-deposit-matches';
const jamie={id:83,first_name_1:'Jamie',last_name_1:'Taylor',status:'onboarding',linked_property_id:26,holding_deposit_requested:1,holding_deposit_amount:131};
const payment={amount:131,currency:'GBP',match_status:'unmatched',description:'Bank payment'};
describe('holding deposit payment visibility',()=>{
 it('matches a deposit amount, including the outstanding portion',()=>{
  expect(holdingDepositMatch(payment,[jamie])).toBe('amount');
  expect(holdingDepositMatch({...payment,amount:31},[{...jamie,holding_deposit_bank_amount:100}])).toBe('amount');
 });
 it('allows name matches, partial payments and either joint applicant',()=>{
  expect(holdingDepositMatch({...payment,amount:50,description:'TAYLOR JAMIE'},[jamie])).toBe('name');
  expect(holdingDepositMatch({...payment,amount:50,merchant_name:'Casey Morgan'},[jamie,{...jamie,id:84,first_name_1:'Casey',last_name_1:'Morgan'}])).toBe('name');
 });
 it('does not disclose unrelated or substring-only names',()=>{
  expect(holdingDepositMatch({...payment,amount:50,description:'Jamie Taylorwood'},[jamie])).toBeNull();
  expect(holdingDepositMatch({...payment,amount:50,description:'Other Person'},[jamie])).toBeNull();
 });
 it('rejects assigned, ignored, outgoing and foreign currency payments',()=>{
  for(const change of [{match_status:'matched_deposit'},{match_status:'ignored'},{currency:'EUR'},{amount:-131},{amount:0}])expect(holdingDepositMatch({...payment,...change},[jamie])).toBeNull();
 });
 it('requires an active requested deposit at one linked property',()=>{
  expect(holdingDepositMatch(payment,[])).toBeNull();
  for(const change of [{status:'converted'},{status:'rejected'},{holding_deposit_requested:0},{linked_property_id:undefined}])expect(holdingDepositMatch(payment,[{...jamie,...change}])).toBeNull();
  expect(holdingDepositMatch(payment,[jamie,{...jamie,id:84,linked_property_id:27}])).toBeNull();
 });
});
