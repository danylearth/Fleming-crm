import {it,expect,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn(),queryOne:vi.fn()}));
import {allowedMarketingSender,emailSignatures,campaignAttachments} from './marketing-files';
it('allows Fleming sender mailboxes and rejects spoofed or injected domains',()=>{
 for(const v of ['enquiries@fleminglettings.co.uk','no-reply@fleminglettings.co.uk','contact@tenancies.fleminglettings.co.uk'])expect(allowedMarketingSender(v)).toBe(true);
 for(const v of ['attacker@example.com','a@fleminglettings.co.uk.evil.test','a@fleminglettings.co.uk\r\nBcc: x@example.com'])expect(allowedMarketingSender(v)).toBe(false);
});
it('extracts complete supplied footer signatures with saved logo URLs',()=>{
 const rows=emailSignatures();expect(rows.length).toBeGreaterThan(0);const signature=rows.find(r=>r.id==='02-viewing-confirmation.html');expect(signature.html).toContain('Lettings Support Team');expect(signature.html).toContain('fleming-logo-white.png');expect(signature.html).toContain('13943597');expect(signature.html).not.toContain('{{');
});
it('rejects duplicate and invalid attachment IDs before accessing file storage',async()=>{
 for(const ids of [[1,1],[-1],['1'],Array.from({length:11},(_,i)=>i+1)])await expect(campaignAttachments(ids)).rejects.toThrow();
 expect(await campaignAttachments([])).toEqual([]);
});
