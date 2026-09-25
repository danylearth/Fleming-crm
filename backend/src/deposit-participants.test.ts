import {describe,it,expect,vi} from 'vitest';
import {resolveDepositParticipants} from './deposit-participants';
const client=(properties:Record<number,number>)=>({query:vi.fn(async(_sql:string,ids:unknown[])=>({rows:properties[Number(ids[0])]? [{id:ids[0],property_id:properties[Number(ids[0])]}]:[]}))});
describe('joint security deposit participants',()=>{
 it('links tenants and enquiries without allocating an amount per person',async()=>{
  const result=await resolveDepositParticipants(client({1:7,2:7}),{participants:[{tenant_id:1},{enquiry_id:2},{tenant_id:1}]});
  expect(result).toEqual({propertyId:7,tenantId:1,participants:[{tenant_id:1},{enquiry_id:2}]});
 });
 it('supports legacy single-tenant requests and enquiry-only deposits',async()=>{
  expect((await resolveDepositParticipants(client({1:7}),{tenant_id:'1'})).participants).toEqual([{tenant_id:1}]);
  expect((await resolveDepositParticipants(client({2:7}),{participants:[{enquiry_id:2}]})).tenantId).toBeNull();
 });
 it('rejects unrelated properties, missing records and invalid selections',async()=>{
  await expect(resolveDepositParticipants(client({1:7,2:8}),{participants:[{tenant_id:1},{tenant_id:2}]})).rejects.toThrow('same property');
  await expect(resolveDepositParticipants(client({}),{participants:[{enquiry_id:2}]})).rejects.toThrow('linked property');
  await expect(resolveDepositParticipants(client({}),{participants:[]})).rejects.toThrow('Choose');
  await expect(resolveDepositParticipants(client({}),{participants:[{tenant_id:1,enquiry_id:2}]})).rejects.toThrow('each participant');
 });
});
