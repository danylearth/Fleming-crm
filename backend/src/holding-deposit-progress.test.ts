import {describe,it,expect} from 'vitest';
import {holdingDepositTotal} from './holding-deposit-progress';
describe('holding deposit reconciliation',()=>{
 it('does not double-count a manually confirmed payment that also appears in the bank feed',()=>{expect(holdingDepositTotal(231,231,231)).toEqual({amount:231,received:true});});
 it('keeps partial payments pending until the expected amount is covered',()=>{expect(holdingDepositTotal(231,0,150)).toEqual({amount:150,received:false});expect(holdingDepositTotal(231,0,250)).toEqual({amount:250,received:true});});
 it('does not treat zero or a reversed bank amount as receipt',()=>{expect(holdingDepositTotal(0,0,0).received).toBe(false);expect(holdingDepositTotal(231,0,-231)).toEqual({amount:0,received:false});});
});
