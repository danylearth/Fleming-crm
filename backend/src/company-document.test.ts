import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import {companyTemplateText} from './company-document';
import {COMPANY_DEFAULTS,type CompanySettings} from './company-settings-values';
it.each(['full_management','let_only','rent_collection'])('omits CMP expiry while retaining membership and other dates: %s',service=>{
 const c:CompanySettings={...COMPANY_DEFAULTS,redress:{...COMPANY_DEFAULTS.redress,expiry:'2027-02-03'},signer:{name:'Example',title:'Director',userId:null,signature:''}};
 const zip=new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',`service-${service}.docx`)));
 const text=companyTemplateText(zip.file('word/document.xml')!.asText(),c,'service').replace(/<[^>]+>/g,'');
 expect(text).toContain('Client Money Protect – membership no. CMP012565');
 expect(text).not.toContain('07/12/2026');
 expect(text).toContain('03/02/2027');
 expect(c.cmp.expiry).toBe('2026-12-07');
});
