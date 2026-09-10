import {it,expect} from 'vitest';
import {rentServiceGroups} from './rentServices';
it('excludes Fleming lets, separates services and uses live rent without double counting joint tenants',()=>{
  const groups=rentServiceGroups([
    {landlord_type:'internal',status:'let_agreed',service_type:'let_only',rent_amount:850},
    {landlord_type:'external',status:'let_agreed',service_type:'let_only',rent_amount:900},
    {landlord_type:'external',status:'let',service_type:'rent_collection',rent_amount:800,active_monthly_rent:950},
    {landlord_type:'external',status:'to_let',service_type:'rent_collection',rent_amount:1000},
    {landlord_type:'external',status:'let',service_type:'full_management',rent_amount:1100},
  ]);
  expect(groups['Let Only Service']).toEqual({count:1,rent:900});
  expect(groups['Rent Collection Service']).toEqual({count:1,rent:950});
  expect(groups['Full Management Service']).toEqual({count:1,rent:1100});
});
