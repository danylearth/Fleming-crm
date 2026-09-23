import {it,expect,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn(),queryOne:vi.fn()}));
import {allowedMarketingSender,emailSignatures,campaignAttachments} from './marketing-files';
it('allows Fleming sender mailboxes and rejects spoofed or injected domains',()=>{
 for(const v of ['enquiries@fleminglettings.co.uk','no-reply@fleminglettings.co.uk','contact@tenancies.fleminglettings.co.uk'])expect(allowedMarketingSender(v)).toBe(true);
 for(const v of ['attacker@example.com','a@fleminglettings.co.uk.evil.test','a@fleminglettings.co.uk\r\nBcc: x@example.com'])expect(allowedMarketingSender(v)).toBe(false);
});
it('uses the supplied team signatures and safely fills the selected user profile',()=>{
 const rows=emailSignatures([{id:1,name:'Sam <Fleming>',email:'sam@fleminglettings.co.uk',department:'Lettings',phone:'07700900123',office_extension:'42',contact_email:'contact@fleminglettings.co.uk'},{id:2,name:'Other User',email:'other@example.test'}],1);
 expect(rows.map(r=>r.label)).toEqual(['Accounts Department','Office Support Team','Sam <Fleming>']);
 const signature=rows.find(r=>r.id==='user')!;expect(signature.html).toContain('Sam &lt;Fleming&gt;');expect(signature.html).toContain('Lettings');expect(signature.html).toContain('contact@fleminglettings.co.uk');expect(signature.html).not.toContain('other@example.test');expect(signature.html).toContain('07700900123');expect(signature.html).toContain('ext. 42');expect(signature.html).toContain('13943597');expect(signature.html).not.toContain('{{');expect(signature.html).toContain('https://crm.fleminglettings.co.uk/email-assets/signature-logo-white.png');
});
it('rejects duplicate and invalid attachment IDs before accessing file storage',async()=>{
 for(const ids of [[1,1],[-1],['1'],Array.from({length:11},(_,i)=>i+1)])await expect(campaignAttachments(ids)).rejects.toThrow();
 expect(await campaignAttachments([])).toEqual([]);
});
