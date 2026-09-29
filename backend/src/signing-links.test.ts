import {expect,it} from 'vitest';
import {createSigningSlug,isSigningSlug,isSigningReference} from './signing-links';
it('uses surname and document title with an unpredictable numeric reference',()=>{
 const slug=createSigningSlug('Tara O’Hanlon','Tenancy Agreement.pdf');
 expect(slug).toMatch(/^ohanlon-tenancy-agreement-\d{39}$/);
 expect(isSigningSlug(slug)).toBe(true);
 expect(createSigningSlug('Tara O’Hanlon','Tenancy Agreement.pdf')).not.toBe(slug);
 expect(createSigningSlug('Alex Morgan (ONBOARDING TEST)','Change')).toMatch(/^morgan-change-/);
});
it('bounds and sanitises names and keeps existing links valid',()=>{
 expect(isSigningReference('a'.repeat(64))).toBe(true);
 expect(isSigningSlug(createSigningSlug('Émilie Example', 'A'.repeat(300)))).toBe(true);
 expect(isSigningSlug(createSigningSlug('中文','???'))).toBe(true);
 for(const invalid of ['example-document-1','../example-document-123','a'.repeat(63),'123'])expect(isSigningReference(invalid)).toBe(false);
});
