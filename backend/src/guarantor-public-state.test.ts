import {describe,it,expect} from 'vitest';
import {publicGuarantorState,publicWitnessState} from './guarantor-public-state';

describe('public witness signing summary',()=>{
 it('uses the frozen deed particulars and recorded signature without disclosing private application data',()=>{
  const row={status:'awaiting_witness',source_sha256:'locked-deed',
   form_snapshot:{name:'Guarantor',witnessName:'Witness',witnessAddress:'2 Test Road',salary:'PRIVATE'},
   tenancy_snapshot:{tenantNames:['Tenant A','Tenant B'],propertyAddress:'1 Test Road',startDate:'2026-10-19',landlord:'Landlord',monthlyRent:900,deposit:900,agreementInput:{private:'PRIVATE'}},
   guarantor_signature:{name:'Guarantor',signed_at:'2026-10-08T12:00:00Z',signature:'c2lnbmF0dXJl',signing_ip:'PRIVATE',user_agent:'PRIVATE'},
   witness_signature:null,review_notes:'PRIVATE',witness_token_encrypted:'PRIVATE'};
  const result=publicWitnessState(row);
  expect(result.tenancy).toEqual({tenantNames:['Tenant A','Tenant B'],propertyAddress:'1 Test Road',startDate:'2026-10-19',landlord:'Landlord',monthlyRent:900,deposit:900});
  expect(result.signed).toEqual({name:'Guarantor',at:'2026-10-08T12:00:00Z'});
  expect(result.signatureImage).toBe('data:image/png;base64,c2lnbmF0dXJl');
  expect(result.sourceHash).toBe('locked-deed');
  expect(result.witnessed).toBeNull();
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  const completed=publicWitnessState({...row,status:'completed',witness_signature:{name:'Witness',signed_at:'2026-10-11T12:00:00Z',signing_ip:'PRIVATE'}});
  expect(completed.witnessed).toEqual({name:'Witness',at:'2026-10-11T12:00:00Z'});
  expect(JSON.stringify(completed)).not.toContain('PRIVATE');
 });
});

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
