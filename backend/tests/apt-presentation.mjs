import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateTenancyAgreementPdf} from '../dist/tenancy-agreement-pdf.js';
const dir=mkdtempSync(path.join(tmpdir(),'fleming-apt-presentation-'));
const clean=s=>s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const input={enquiryId:1,agreementType:'client',serviceType:'let_only',agreementDate:new Date('2026-09-23T12:00Z'),tenancyStartDate:new Date('2026-10-05T12:00Z'),rent:750,deposit:750,holdingDeposit:173,propertyAddress:'12 QA Street, Wolverhampton, WV10 8EU',hasGas:false,landlord:{name:'Example Company Ltd',signingName:'Jane Director, signing on behalf of Example Company Ltd',companyNumber:'12345678',address:'2 Owner Road, Wolverhampton, WV1 1AA',email:'landlord@example.test',phone:'07700900111'},tenants:[{name:'Alex Applicant',email:'applicant@example.test',address:'3 Old Street',phone:'07700900222'},{name:'Jordan Applicant',email:'joint@example.test',address:'4 Old Street',phone:'07700900333'}],permittedOccupiers:'None',sharedFacilities:'None',parking:'Private driveway',paymentReference:'12 WV108EU - APPLICANT',bankDetails:{sortCode:'12-34-56',accountNumber:'12345678',accountName:'Example Company Ltd',bankName:'Example Bank'},paymentRoute:'landlord',complianceDocuments:['EPC','EICR']};
for(const type of ['let_only','rent_collection','internal'])for(const hasGas of [false,true]){
 const file=path.join(dir,`${type}-${hasGas?'gas':'no-gas'}.pdf`);writeFileSync(file,await generateTenancyAgreementPdf({...input,agreementType:type==='internal'?'internal':'client',serviceType:type,hasGas}));
 const result=spawnSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});assert.equal(result.status,0);const text=result.stdout,pages=text.split('\f').slice(0,-1);
 assert(pages.every(p=>p.trim().length>50),'Blank page');assert.equal((text.match(/Gas Safety Certificate/g)||[]).length,hasGas?1:0,`${type}: gas acknowledgement`);
 assert(pages[0].indexOf('Assured Periodic Tenancy Agreement')>=0);assert(pages[0].indexOf('Assured Periodic Tenancy Agreement')<pages[0].indexOf('This agreement is dated:'));
 const heading='Section C - Terms and Conditions';const section=pages.find(p=>p.includes(heading));assert(section,'Missing Section C');assert(section.includes('1.   General Terms')||/1\.\s+General Terms/.test(section),'Section C orphaned');
 const before=section.slice(0,section.indexOf(heading));assert(!/mean the tenant|Definitions|working day/.test(before),'Section C remains below definitions');
 const clause='Ensure that the property complies with The Smoke and Carbon Monoxide Alarm (England) Regulations 2015 at the start of the tenancy.';assert(pages.some(p=>clean(p).includes(clean(clause))),`${type}: split clause 3.6`);
 for(const label of ['Condition of the Property','Leaving the Property Empty','Letters and Notices','You Must:'])assert(text.includes(label),`Missing ${label}`);
 console.log(`PASS ${type}, ${hasGas?'gas':'no gas'}: acknowledgement, first-page title, Section C, clause 3.6 and headings (${pages.length} pages)`);
}
console.log('PDF artifacts: '+dir);
