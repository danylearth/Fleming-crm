import { describe,it,expect } from 'vitest';
import { tenantCompletion } from './tenantCompletion';
describe('tenant completion',()=>{
  it('excludes guarantors unless explicitly required and counts legacy joint only without a linked record',()=>{
    expect(tenantCompletion({guarantor_required:false}).length).toBe(6);
    expect(tenantCompletion({guarantor_required:1}).length).toBe(8);
    expect(tenantCompletion({guarantor_required:'0'}).length).toBe(6);
    expect(tenantCompletion({is_joint_tenancy:true,first_name_2:'Partner'}).length).toBe(7);
    expect(tenantCompletion({is_joint_tenancy:true,first_name_2:'Partner'},2).length).toBe(6);
  });
  it('allows audited overrides to complete every missing item without falsifying evidence',()=>{
    const keys=tenantCompletion({}).map(i=>i.key),override={reason:'Reviewed offline',by:'staff@example.test',at:'2026-09-09'};
    const items=tenantCompletion({},undefined,Object.fromEntries(keys.map(k=>[k,override])));
    expect(items.every(i=>i.done)).toBe(true);expect(items.every(i=>!i.recorded)).toBe(true);
    expect(tenantCompletion({kyc_primary_id:1})[1].done).toBe(true);
  });
});
