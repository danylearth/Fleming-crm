import {describe,it,expect} from 'vitest';
import {propertyServiceFees} from './property-service-fees';
describe('property onboarding fees',()=>{
 it('stores Let Only first rent percentage and no ongoing fee',()=>expect(propertyServiceFees('let_only','75','12')).toEqual({service_setup_fee:75,service_monthly_fee:0}));
 it.each(['rent_collection','full_management'])('keeps both percentages for %s',service=>expect(propertyServiceFees(service,'75','9.5')).toEqual({service_setup_fee:75,service_monthly_fee:9.5}));
 it('allows explicitly agreed zero fees',()=>expect(propertyServiceFees('rent_collection',0,'0')).toEqual({service_setup_fee:0,service_monthly_fee:0}));
 it.each(['',null,undefined,'not a number',-1,101,false])('rejects missing or invalid required percentage %s',value=>expect(()=>propertyServiceFees('rent_collection',75,value)).toThrow());
 it('does not charge an internal portfolio',()=>expect(propertyServiceFees(null,null,null)).toEqual({service_setup_fee:null,service_monthly_fee:null}));
});
