import {it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import {fillServiceTemplate} from './service-agreement-pdf';
for(const service of ['let_only','rent_collection','full_management'])it(`fills every supplied ${service} field and keeps all clauses`,()=>{
 const original=new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',`service-${service}.docx`))).file('word/document.xml')!.asText();
 const output=fillServiceTemplate(original,{service_type:service,setup_fee:50,monthly_fee:10,details:{agreement_date:'2026-09-23',landlord_name:'Example & Sons Ltd',company_number:'12345678',landlord_address:'1 Test Road',landlord_email:'test@example.test',landlord_phone:'07700900000',property_address:'2 Home Road WV1 1AA',asking_rent:900,signatory_name:'Jane Director'},bank_details:{account_name:'Example Ltd',bank_name:'Test Bank',sort_code:'12-34-56',account_number:'12345678'}});
 expect(output).not.toContain('#####');expect(output).not.toContain('LIMITED COMPANY NAME');expect(output).not.toContain('NAME OF AUTHORISED SIGNATORY');expect(output).toContain('50% of');expect(output).toContain('Example &amp; Sons Ltd');expect(output).toContain('Jane Director');expect(output).toContain('900.00');
 const paragraphs=(x:string)=>[...x.matchAll(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)].map(m=>m[0].replace(/<[^>]+>/g,''));
 for(const text of paragraphs(original).filter(t=>!t.includes('#####')))expect(paragraphs(output)).toContain(text);
});
