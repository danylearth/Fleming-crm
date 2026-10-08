import {describe,it,expect} from 'vitest';
import {publicGuarantorState} from './guarantor-public-state';

describe('public guarantor application boundary',()=>{
 const fixture=()=>({
  g:{status:'changes_requested',contact:{name:'Guarantor'},form:{name:'Guarantor'},uploads:{},docs:[],revisionEdits:[],revisionUploads:[],events:[{private:'office activity'}]},
  data:{reviewStatus:'changes_requested',reviews:{'Personal Details':{status:'rejected',notes:'Internal discussion'}},documentReviews:{900100:{status:'rejected',notes:'Internal document note'}},guarantorCredit:{report:'Private credit result'},changes:{message:'Please correct your name'},changesSent:null},
  tenancy:{tenantNames:['Tenant'],propertyAddress:'1 Example Road',startDate:'2026-11-06',monthlyRent:1100,deposit:1000,agreementInput:{companySettings:{signature:'Private company configuration'}},tenancyHash:'internal'},
  record:{internal:'Office review'},documents:[{review_notes:'Internal'}],applicationUrl:'secret-guarantor-link',witnessUrl:'secret-witness-link',
  executionId:3,sourceHash:'reviewed-source',witnessInvitationDelivery:{status:'failed',at:'today',error:'Provider internals'},completionEmail:null,
 });
 it('returns only public data and does not expose the other signing invitation',()=>{
  const result=publicGuarantorState(fixture());
  expect(result.tenancy.tenantNames).toEqual(['Tenant']);
  expect(result.sourceHash).toBe('reviewed-source');
  expect(result.data.reviews['Personal Details']).toEqual({status:'rejected'});
  expect(result.witnessInvitationDelivery).toEqual({status:'failed',at:'today'});
  const serialized=JSON.stringify(result);
  for(const value of ['Private','Internal','secret-','Provider internals','Office review','office activity'])expect(serialized).not.toContain(value);
  expect(result).not.toHaveProperty('record');
  expect(result).not.toHaveProperty('documents');
  expect(result.tenancy).not.toHaveProperty('agreementInput');
 });
 it('only shows the corrections that have actually been sent',()=>{
  const state=fixture();
  expect(publicGuarantorState(state).data.changes).toBeNull();
  const sent={...state,data:{...state.data,changes:{...state.data.changes,internal_notes:'Office-only discussion'},changesSent:'2026-10-05T12:00:00Z'}};
  expect(publicGuarantorState(sent).data.changes).toEqual({message:'Please correct your name'});
  expect(JSON.stringify(publicGuarantorState(sent))).not.toContain('Office-only discussion');
 });
});
