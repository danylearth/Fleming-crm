import { describe,it,expect } from 'vitest';
import { tenantCompletion } from './tenantCompletion';
describe('tenant completion',()=>{
  it('counts existing imported documents without changing verification flags',()=>{
    const form={application_forms_completed:1,income_amount:'45000',kyc_primary_id:0,kyc_secondary_id:0,kyc_address_verification:0};
    const docs=[
      {doc_type:'Primary Identification',original_name:'Passport.jpg',review_status:'pending'},
      {doc_type:'Secondary Identification',original_name:'Driving Licence.pdf'},
      {doc_type:'Secondary Identification',original_name:'Secondary Identification - Utility Bill.pdf'},
    ];
    const items=tenantCompletion(form,undefined,{},docs);
    expect(items.every(item=>item.done)).toBe(true);
    expect(items.find(item=>item.key==='kyc_address_verification')?.evidence).toContain('Utility Bill');
    expect(form.kyc_primary_id).toBe(0);
    expect(tenantCompletion(form,undefined,{},docs.slice(0,2)).filter(item=>item.done)).toHaveLength(4);
  });
  it('does not count rejected files, unrelated documents or guarantor ID as tenant ID',()=>{
    const docs=[{doc_type:'Primary Identification',review_status:'rejected'},{doc_type:'guarantor_primary_id'},{doc_type:'Other',original_name:'Passport.pdf'}];
    expect(tenantCompletion({},undefined,{},docs).some(item=>item.done)).toBe(false);
  });
  it('excludes guarantors unless explicitly required and counts legacy joint only without a linked record',()=>{
    expect(tenantCompletion({guarantor_required:false}).length).toBe(5);
    expect(tenantCompletion({guarantor_required:1}).length).toBe(7);
    expect(tenantCompletion({guarantor_required:'0'}).length).toBe(5);
    expect(tenantCompletion({is_joint_tenancy:true,first_name_2:'Partner'}).length).toBe(6);
    expect(tenantCompletion({is_joint_tenancy:true,first_name_2:'Partner'},2).length).toBe(5);
  });
  it('allows audited overrides to complete every missing item without falsifying evidence',()=>{
    const keys=tenantCompletion({}).map(i=>i.key),override={reason:'Reviewed offline',by:'staff@example.test',at:'2026-09-09'};
    const items=tenantCompletion({},undefined,Object.fromEntries(keys.map(k=>[k,override])));
    expect(items.every(i=>i.done)).toBe(true);expect(items.every(i=>!i.recorded)).toBe(true);
    expect(tenantCompletion({kyc_primary_id:1}).find(item=>item.key==='kyc_primary_id')?.done).toBe(true);
  });
  it('does not require authority to contact for tenant completion',()=>{
    const items=tenantCompletion({authority_to_contact:0,kyc_primary_id:1,kyc_secondary_id:1,kyc_address_verification:1,application_forms_completed:1,proof_of_income:1});
    expect(items.some(item=>item.key==='authority_to_contact')).toBe(false);
    expect(items.every(item=>item.done)).toBe(true);
  });
});
