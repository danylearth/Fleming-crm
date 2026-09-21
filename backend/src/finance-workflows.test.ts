import {describe,it,expect} from 'vitest';
import {canAccessFinance} from './auth';
import {pennies} from './bank-reconciliation';
import {rentDueDates} from './finance-scheduler';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import {formalAgreementDate,formatContractLayout} from './tenancy-template';
describe('office finance rules',()=>{
 it('restricts finance independently of the general staff hierarchy',()=>{
  expect(canAccessFinance({role:'admin'})).toBe(true);
  expect(canAccessFinance({role:'staff',department:'Accounts'})).toBe(true);
  expect(canAccessFinance({role:'staff',finance_access:true})).toBe(true);
  expect(canAccessFinance({role:'manager'})).toBe(false);
  expect(canAccessFinance({role:'staff',department:'Lettings'})).toBe(false);
 });
 it('rejects invalid money instead of rounding allocations silently',()=>{
  expect(pennies('800.20')).toBe(80020);
  for(const amount of [0,-1,NaN,Infinity,'',true,1.001])expect(()=>pennies(amount)).toThrow();
 });
 it('keeps the original due day after a short month, including leap years',()=>{
  expect(rentDueDates('2024-01-31','2024-04-30')).toEqual(['2024-01-31','2024-02-29','2024-03-31','2024-04-30']);
  expect(rentDueDates('2026-09-21','2026-09-20')).toEqual([]);
  expect(rentDueDates('2026-02-06','2026-04-06',5)).toEqual(['2026-02-05','2026-03-05','2026-04-05']);
 });
 it('preserves every contract text run through nested-table layout changes',()=>{
  const xml=new PizZip(fs.readFileSync(path.join(process.cwd(),'src/agreement-assets/assured-periodic-tenancy-template.docx'))).file('word/document.xml')!.asText();
  const texts=(value:string)=>Array.from(value.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g),m=>m[1]);
  expect(texts(formatContractLayout(xml))).toEqual(texts(xml));
 });
 it('formats ordinal dates without changing their London calendar day',()=>{
  expect(formalAgreementDate(new Date('2026-09-21T12:00Z'))).toBe('21st September 2026');
  expect(formalAgreementDate(new Date('2026-09-12T12:00Z'))).toBe('12th September 2026');
 });
});
