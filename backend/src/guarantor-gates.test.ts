import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./guarantor-tenancy',()=>({guarantorTenancyContext:vi.fn()}));
import {guarantorTenancyContext} from './guarantor-tenancy';
import {assertIssuedAgreementMatchesGuarantees} from './guarantor-gates';

describe('signed guarantee and final APT matching',()=>{
  const address='99 Example Road, Wolverhampton, WV10 9ER';
  const input={propertyAddress:address,agreementType:'internal',tenants:[{name:'Ms Alex Example',email:'alex@example.test',phone:'07123456789'}],rent:1100,deposit:1100};
  const snapshot={agreementInput:{...input,propertyAddress:address+', WV10 9ER'},propertyAddress:address+', WV10 9ER',startDate:'2026-11-06',monthlyRent:1100,deposit:1100,landlord:'Example Landlord',tenantNames:['Ms Alex Example']};
  const details={tenancyStartDate:'2026-11-06',rent:1100,deposit:1100,landlordName:'Example Landlord'};
  const client={query:vi.fn(async(sql:string)=>{
    if(sql.includes('LEFT JOIN guarantor_verifications'))return {rows:[{id:1,guarantor_required:true,verification_id:2,status:'verified',execution_status:'completed',signed_pdf:Buffer.from('signed'),workflow:{reviewStatus:'approved',credit:{credit_check_completed:true}}}]};
    if(sql.includes('SELECT id FROM tenancy_agreements'))return {rowCount:0,rows:[]};
    return {rows:[{id:2,enquiry_id:1,tenancy_snapshot:snapshot}]};
  })};
  beforeEach(()=>vi.mocked(guarantorTenancyContext).mockResolvedValue({input} as any));
  const check=(changes={},names=snapshot.tenantNames,property=address)=>assertIssuedAgreementMatchesGuarantees(client as any,[1],{...details,...changes},names,property);
  it('accepts a duplicate postcode correction and completion-only fields without changing signed evidence',async()=>{
    const original=JSON.stringify(snapshot);
    await expect(check({permittedOccupiers:'Two children.',sharedFacilities:'None.',parking:'Private driveway.',paymentReference:'NEW DISPLAY REFERENCE'})).resolves.toBeUndefined();
    expect(JSON.stringify(snapshot)).toBe(original);
  });
  it.each([{rent:1200},{deposit:1200},{tenancyStartDate:'2026-12-06'},{landlordName:'Different Landlord'}])('blocks changed core terms %j',async changes=>{
    await expect(check(changes)).rejects.toThrow('differs from the terms');
  });
  it('allows updated phone numbers and email addresses for the same tenant',async()=>{
    vi.mocked(guarantorTenancyContext).mockResolvedValue({input:{...input,tenants:[{...input.tenants[0],email:'updated@example.test',phone:'07999999999'}]}} as any);
    await expect(check()).resolves.toBeUndefined();
  });
  it('blocks a different tenant or property',async()=>{
    await expect(check({},['Other Tenant'])).rejects.toThrow('differs from the terms');
    await expect(check({},undefined,'98 Example Road, Wolverhampton, WV10 9ER')).rejects.toThrow('differs from the terms');
    await expect(check({},undefined,'99 Example Road, Wolverhampton, WV10 9ES')).rejects.toThrow('differs from the terms');
  });
  it.each([{agreementType:'client'},{tenants:[{...input.tenants[0],name:'Different Tenant'}]},{rent:1200},{deposit:1200}])('retains the frozen core tenancy checks %j',async changes=>{
    vi.mocked(guarantorTenancyContext).mockResolvedValue({input:{...input,...changes}} as any);
    await expect(check()).rejects.toThrow('proposed tenancy has changed');
  });
});
