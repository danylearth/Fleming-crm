import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn()}));
import {recipientOptions,selectSignatureRecipients,resolveSignatureRecipients,searchSignatureRecipients} from './signature-recipients';
import {query} from './db-pg';
beforeEach(()=>vi.mocked(query).mockReset());
describe('record-linked signing recipients',()=>{
 const tenant={id:1,name:'Jamie',email:'jamie@example.test',is_joint_tenancy:1,first_name_2:'Casey',last_name_2:'Taylor',email_2:'casey@example.test'};
 it('includes both contacts on an inline joint tenancy as distinct signers',()=>{const options=recipientOptions('tenant',[tenant]);expect(options.map(p=>p.key)).toEqual(['tenant:1:primary','tenant:1:joint']);expect(selectSignatureRecipients(options,options)).toHaveLength(2);});
 it('does not duplicate an inline partner when a separate linked record exists',()=>{expect(recipientOptions('tenant',[{...tenant,linked_tenant_id:2},{id:2,name:'Casey',email:'casey@example.test',linked_tenant_id:1}]).map(p=>p.key)).toEqual(['tenant:1:primary','tenant:2:primary']);});
 it('rejects IDs absent from the resolved record list',()=>{const allowed=recipientOptions('tenant',[tenant]);for(const selected of [{entity_type:'tenant',entity_id:99},{entity_type:'landlord',entity_id:1}])expect(()=>selectSignatureRecipients([selected],allowed)).toThrow('unavailable');});
 it('does not treat an alternate landlord email as a joint owner',()=>{expect(recipientOptions('landlord',[{id:1,name:'Alex',email:'alex@example.test',alt_email:'other@example.test'}])).toHaveLength(1);});
 it('rejects missing emails and duplicate selections',()=>{const options=recipientOptions('tenant',[tenant]);expect(()=>selectSignatureRecipients([options[0],options[0]],options)).toThrow('twice');const blank=recipientOptions('tenant',[{...tenant,email:''}]);expect(()=>selectSignatureRecipients([blank[0]],blank)).toThrow('email address');});
});

it('resolves explicitly added tenants and companies using saved email addresses',async()=>{
 vi.mocked(query).mockResolvedValueOnce([{id:9,name:'Jamie Tenant',email:'jamie@example.test'}]).mockResolvedValueOnce([{id:8,name:'Example Ltd',email:'office@example.test',entity_type:'company'}]);
 const result=await resolveSignatureRecipients([{entity_type:'tenant',entity_id:9,email:'forged@example.test'},{entity_type:'landlord',entity_id:8}]);
 expect(result.map(p=>p.email)).toEqual(['jamie@example.test','office@example.test']);expect(result[1].record_type).toBe('Limited company');
});
it('rejects missing records, invalid kinds and excessive selections',async()=>{
 vi.mocked(query).mockResolvedValue([]);
 await expect(resolveSignatureRecipients([{entity_type:'tenant',entity_id:999}])).rejects.toThrow('unavailable');
 await expect(resolveSignatureRecipients([{entity_type:'user',entity_id:1}])).rejects.toThrow('valid');
 await expect(resolveSignatureRecipients(Array.from({length:11},(_,i)=>({entity_type:'tenant',entity_id:i+1})))).rejects.toThrow('between');
});
it('searches both record kinds, includes inline joint tenants and labels companies',async()=>{
 vi.mocked(query).mockResolvedValueOnce([{id:9,name:'Primary Person',email:'primary@example.test',is_joint_tenancy:1,first_name_2:'Morgan',last_name_2:'Tenant',email_2:'joint@example.test'}]).mockResolvedValueOnce([{id:8,name:'Morgan Ltd',email:'office@example.test',entity_type:'company'}]);
 const result=await searchSignatureRecipients('Morgan');expect(result.map(p=>p.key).sort()).toEqual(['landlord:8:primary','tenant:9:joint']);expect(result.find(p=>p.entity_type==='landlord')?.record_type).toBe('Limited company');
});
it('does not list the entire CRM for an empty search and treats wildcards literally',async()=>{
 expect(await searchSignatureRecipients('')).toEqual([]);expect(query).not.toHaveBeenCalled();vi.mocked(query).mockResolvedValue([]);await searchSignatureRecipients('A%');expect(vi.mocked(query).mock.calls[0][1]).toEqual(['%A\\%%']);
});
