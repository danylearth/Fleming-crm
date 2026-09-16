import {expect,it} from 'vitest';
import {allocateAnnualCost} from './property-policies';
it('allocates a portfolio premium once without losing or adding pennies',()=>{
 const allocations=allocateAnnualCost(100,[1,2,3]);expect(allocations.map(a=>a.amount)).toEqual([33.34,33.33,33.33]);expect(allocations.reduce((s,a)=>s+Math.round(a.amount*100),0)).toBe(10000);
});
