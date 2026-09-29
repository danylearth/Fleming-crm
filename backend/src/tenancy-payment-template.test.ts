import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import {prepareClientPaymentTemplate} from './tenancy-template';
const source=(file:string)=>new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',file))).file('word/document.xml')!.asText();
describe('APT payment instructions and bank tables',()=>{
 it.each(['full_management','rent_collection'])('keeps all %s payments in client money and applies the confirmed account name and bank',service=>{
  const xml=prepareClientPaymentTemplate(source('client-rent-collection-aug26.docx'),service);
  const text=xml.replace(/<[^>]+>/g,'');
  expect(text).toContain('All rent, including the initial payment of rent');expect(text).toContain('at its client money account.');
  expect(text).toContain('This is the same account you paid your holding deposit into');
  expect(text).toContain('{{BANK_ACCOUNT_NAME}}');expect(text).toContain('{{BANK_NAME}}');expect(text).toContain('{{BANK_ACCOUNT_NUMBER}}');
 });
 it('uses the client money account initially for let-only and the separately confirmed landlord account afterwards',()=>{
  const xml=prepareClientPaymentTemplate(source('client-let-only-aug26.docx'),'let_only');
  const text=xml.replace(/<[^>]+>/g,'');
  expect(text).toContain('at its client money account.');expect(text).not.toContain('at its company account.');
  expect(text).toContain('{{INITIAL_ACCOUNT_NAME}}');expect(text).toContain('{{INITIAL_BANK_NAME}}');
  expect(text).toContain('All subsequent rent payments must be paid directly to the Landlord');
  expect(text).toContain('{{BANK_ACCOUNT_NAME}}');expect(text).toContain('{{BANK_ACCOUNT_NUMBER}}');
 });
});
