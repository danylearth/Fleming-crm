import {it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import {formatAptPresentation,formatClientContractLayout,formatContractLayout,formatAgreementFlow} from './tenancy-template';
const templates=['client-let-only-aug26.docx','client-rent-collection-aug26.docx','assured-periodic-tenancy-template.docx'];
const text=(xml:string)=>[...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('');
it.each(templates)('removes the information-sheet receipt row and optional no-gas row, preserving other contract wording in %s',file=>{
 const source=new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',file))).file('word/document.xml')!.asText();
 const layout=file.startsWith('client-')?formatClientContractLayout(source):formatContractLayout(source);
 for(const hasGas of [true,false]){
  const formatted=formatAptPresentation(layout,hasGas);
  const expected=text(layout).replace('The Renters’ Rights Act Information Sheet 2026','').replace(/This agreement is dated:\s*\{\{AGREEMENT_DATE\}\}/g,'This agreement is dated {{AGREEMENT_DATE}}.').replace(/Gas Safety Certificate|\{\{GAS_ACKNOWLEDGEMENT\}\}/g,m=>hasGas?m:'').toLowerCase();
  expect(text(formatted).replace('Assured Periodic Tenancy Agreement','').toLowerCase()).toBe(expected);
  expect(text(formatted)).toContain('1.   General Terms');expect(text(formatted)).toContain('2.   You Must:');
  for(const label of ['Condition of the Property','Leaving the Property Empty','Letters and Notices','Rent and Other Payments'])expect(text(formatted)).toContain(label);
  const paragraphs=[...formatted.matchAll(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)].map(m=>m[0]);
  for(const p of paragraphs.filter(p=>/^\d+\.\s+[A-Za-z]/.test(text(p))))expect(p).not.toMatch(/<w:u\b/);
  expect(paragraphs.find(p=>text(p)==='Section C - Terms and Conditions')).toContain('<w:pageBreakBefore/>');
  expect(paragraphs.find(p=>text(p).includes('3.6 '))).toContain('<w:keepLines/>');
  expect(formatted).not.toContain('<w:lastRenderedPageBreak');
  expect(text(formatted)).toContain('This agreement is dated {{AGREEMENT_DATE}}.');
  expect(formatted).toContain('<w:top w:val="nil"/>');
 }
});

it.each(templates)('preserves clauses and provides flowing fields and consistent receipt labels in %s',file=>{
 const source=new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',file))).file('word/document.xml')!.asText();
 const before=formatAptPresentation(file.startsWith('client-')?formatClientContractLayout(source):formatContractLayout(source),true);
 const after=formatAgreementFlow(before,{OCCUPIERS:'Long description '.repeat(100),DEPOSIT_CONTRIBUTOR:''});
 const normalize=(value:string)=>text(value).replace(/\s/g,'').replace('{{DEPOSIT_CONTRIBUTOR}}','');
 expect(normalize(after)).toBe(normalize(before));
 const paragraphs=[...after.matchAll(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)].map(m=>m[0]);
 expect(paragraphs.find(p=>p.includes('{{OCCUPIERS}}'))).toContain('<w:keepLines w:val="0"/>');
 for(const name of ['Section 190 of the Equality Act 2010','Prior Notice Requirements']){const p=paragraphs.find(p=>text(p)===name);if(p)expect(p).toContain('w:before="120"');}
 const gas=paragraphs.find(p=>text(p)==='{{GAS_ACKNOWLEDGEMENT}}'||text(p)==='Gas Safety Certificate');expect(gas).toContain('<w:b/>');
 expect(after).not.toContain('w:hRule="exact" w:val="950"');
});

it.each(['client-let-only-aug26.docx','client-rent-collection-aug26.docx'])('keeps signature spacing consistent and preserves wording in %s',async file=>{
 const {formatSignatureSpacing}=await import('./tenancy-template');
 const source=new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',file))).file('word/document.xml')!.asText();
 const before=formatAgreementFlow(formatAptPresentation(formatClientContractLayout(source),true),{}),after=formatSignatureSpacing(before);
 expect(text(after).replace(/\s/g,'')).toBe(text(before).replace(/\s/g,''));
 const paragraphs=[...after.matchAll(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)].map(m=>m[0]);expect(paragraphs.find(p=>text(p)==='Signed as an agreement')).toContain('w:before="360"');
 const names=paragraphs.filter(p=>text(p)==='{{LANDLORD_SIGNATORY}}');for(const p of names)expect(p).toContain('w:after="80"');
});
