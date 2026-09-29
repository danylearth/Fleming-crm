import {describe,it,expect} from 'vitest';
import {finalBalanceMatch} from './final-balance-matches';
const people=[{first_name_1:'Jamie',last_name_1:'Taylor',balance_due_amount:1769,balance_bank_amount:1000}];
describe('onboarding payment matches',()=>{
 it('shows exact balance and remaining balance amounts',()=>{expect(finalBalanceMatch({amount:1769},people)).toBe('amount');expect(finalBalanceMatch({amount:769},people)).toBe('amount');});
 it('matches applicant names in either order and allows partial amounts',()=>{expect(finalBalanceMatch({amount:300,description:'TAYLOR, JAMIE rent'},people)).toBe('name');});
 it('does not expose unrelated payments or substring matches',()=>{expect(finalBalanceMatch({amount:300,description:'Jamie Taylorwood'},people)).toBeNull();expect(finalBalanceMatch({amount:300,description:'Someone Else'},people)).toBeNull();expect(finalBalanceMatch({amount:-1769,description:'Jamie Taylor'},people)).toBeNull();});
 it('includes joint applicants',()=>{expect(finalBalanceMatch({amount:300,merchant_name:'Casey Morgan'},[...people,{first_name_1:'Casey',last_name_1:'Morgan'}])).toBe('name');});
});
