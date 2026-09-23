import {it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import {formatAptPresentation,formatClientContractLayout,formatContractLayout} from './tenancy-template';
const templates=['client-let-only-aug26.docx','client-rent-collection-aug26.docx','assured-periodic-tenancy-template.docx'];
const text=(xml:string)=>[...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('');
it.each(templates)('removes only the no-gas acknowledgement and preserves all other contract wording in %s',file=>{
 const source=new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',file))).file('word/document.xml')!.asText();
 const layout=file.startsWith('client-')?formatClientContractLayout(source):formatContractLayout(source);
 for(const hasGas of [true,false]){
  const formatted=formatAptPresentation(layout,hasGas);
  const expected=text(layout).replace(/Gas Safety Certificate|\{\{GAS_ACKNOWLEDGEMENT\}\}/g,m=>hasGas?m:'').toLowerCase();
  expect(text(formatted).replace('Assured Periodic Tenancy Agreement','').toLowerCase()).toBe(expected);
  expect(text(formatted)).toContain('1.   General Terms');expect(text(formatted)).toContain('2.   You Must:');
  for(const label of ['Condition of the Property','Leaving the Property Empty','Letters and Notices','Rent and Other Payments'])expect(text(formatted)).toContain(label);
  const paragraphs=[...formatted.matchAll(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)].map(m=>m[0]);
  for(const p of paragraphs.filter(p=>/^\d+\.\s+[A-Za-z]/.test(text(p))))expect(p).not.toMatch(/<w:u\b/);
  expect(paragraphs.find(p=>text(p)==='Section C - Terms and Conditions')).toContain('<w:pageBreakBefore/>');
  expect(paragraphs.find(p=>text(p).includes('3.6 '))).toContain('<w:keepLines/>');
  expect(formatted).not.toContain('<w:lastRenderedPageBreak');
 }
});
