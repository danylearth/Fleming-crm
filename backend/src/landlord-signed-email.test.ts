import {expect,it} from 'vitest';
import {completedLandlordAgreementEmail,inlineEmailImages} from './email';
it('personalises the supplied landlord signed-copy template and embeds its images',()=>{
 const email=completedLandlordAgreementEmail('Alex <Morgan>','24 Example Gardens, EX2 3CD','Rent Collection','2026-09-25T12:00:00Z');
 expect(email.html).toContain('Alex &lt;Morgan&gt;');expect(email.html).toContain('25th September 2026');expect(email.html).toContain('Rent Collection');expect(email.html).not.toMatch(/LANDLORD NAME|PROPERTY ADDRESS|DATE SIGNED|\{\{/);
 const inline=inlineEmailImages(email.html);expect(inline.attachments.filter(a=>!a.filename.startsWith('social-')).map(a=>a.filename).sort()).toEqual(['landlord-signed-logo.png','signed-copy-band.png']);expect(inline.html).toContain('cid:fleming-signed-copy-band.png');
});
