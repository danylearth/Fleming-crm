import {describe,it,expect,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn()}));
import {summariseEarnings,rentDueToLandlord} from './property-earnings';
describe('earnings from confirmed receipts',()=>{
 const base={property_id:1,address:'Example',service_type:'full_management'};
 it('adds the letting fee and fees on actual partial and full rent receipts',()=>{
  const [r]=summariseEarnings([{...base,kind:'setup',amount:1250,rate:75},{...base,kind:'rent',amount:1250,rate:12},{...base,kind:'rent',amount:500,rate:12}]);
  expect(r).toMatchObject({client_rent:1750,letting_fees:937.5,ongoing_fees:210,total:1147.5,missing_rates:0});
 });
 it('does not add monthly earnings for Let Only',()=>{
  const [r]=summariseEarnings([{...base,service_type:'let_only',kind:'setup',amount:1000,rate:null,fixed_fee:800},{...base,service_type:'let_only',kind:'rent',amount:1000,rate:15}]);
  expect(r.total).toBe(800);expect(r.ongoing_fees).toBe(0);
 });
 it('uses each receipt rate and flags missing history without inventing earnings',()=>{
  const [r]=summariseEarnings([{...base,kind:'rent',amount:1000,rate:10},{...base,kind:'rent',amount:1000,rate:12},{...base,kind:'rent',amount:1000,rate:null}]);
  expect(r.total).toBe(220);expect(r.missing_rates).toBe(1);
 });
 it('accepts an explicit zero fee and rounds each fee to pennies',()=>{
  const [r]=summariseEarnings([{...base,kind:'setup',amount:1000,rate:75,fixed_fee:0},{...base,kind:'rent',amount:333.33,rate:10}]);
  expect(r.total).toBe(33.33);expect(r.missing_rates).toBe(0);
 });
});

describe('landlord balance',()=>{
 it('deducts the earned ongoing fee and actual remittances',()=>{expect(rentDueToLandlord(1000,100,0,0)).toBe(900);expect(rentDueToLandlord(1000,100,600,0)).toBe(300);});
 it('does not invent a balance when fee history is missing',()=>{expect(rentDueToLandlord(1000,0,0,1)).toBeNull();});
 it('does not present an overpayment as a negative amount due',()=>{expect(rentDueToLandlord(1000,100,1000,0)).toBe(0);});
});
