import {describe,it,expect} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {assertGuarantorEvidenceEditable,validateGuarantorEvidence,guarantorEvidencePath} from './guarantor-evidence';
describe('guarantor evidence',()=>{
 it('requires a genuine supported document',async()=>{
  await expect(validateGuarantorEvidence(Buffer.from('<html>not a PDF</html>'))).rejects.toThrow();
  await expect(validateGuarantorEvidence(Buffer.from('%PDF-not-valid'))).rejects.toThrow();
  const pdf=await PDFDocument.create();pdf.addPage();
  expect(await validateGuarantorEvidence(Buffer.from(await pdf.save()))).toEqual({mime:'application/pdf',extension:'.pdf'});
 });
 it('locks signed evidence except specifically requested corrections',()=>{
  const g={status:'changes_requested',signature:{},workflow:{reviewStatus:'changes_requested',changesSent:'2026-10-05'}};
  expect(()=>assertGuarantorEvidenceEditable(g,'Bank Statements',[{category:'Bank Statements',review_status:'approved'}])).toThrow(/Only documents/);
  expect(()=>assertGuarantorEvidenceEditable(g,'Bank Statements',[{category:'Bank Statements',review_status:'rejected'}])).not.toThrow();
  expect(()=>assertGuarantorEvidenceEditable({...g,status:'awaiting_witness'},'Bank Statements',[])).toThrow(/locked/);
  expect(()=>assertGuarantorEvidenceEditable({...g,workflow:{...g.workflow,changesSent:null}},'Bank Statements',[])).toThrow(/Only documents/);
 });
 it('never gives invitation holders permission to upload office credit reports',()=>{
  const g={status:'submitted',workflow:{reviewStatus:'approved'}};
  expect(()=>assertGuarantorEvidenceEditable(g,'Credit Check Report',[],false)).toThrow();
  expect(()=>assertGuarantorEvidenceEditable(g,'Credit Check Report',[],true)).not.toThrow();
  expect(()=>assertGuarantorEvidenceEditable({...g,status:'verified'},'Credit Check Report',[],true)).toThrow();
 });
 it('only resolves server-generated evidence filenames',()=>{
  expect(()=>guarantorEvidencePath('/tmp/uploads','../company-private.pdf')).toThrow();
  expect(()=>guarantorEvidencePath('/tmp/uploads','guarantor-../../private.pdf')).toThrow();
  expect(guarantorEvidencePath('/tmp/uploads','guarantor-12345678-abcd-1234-abcd-123456abcdef.pdf')).toContain('guarantor-12345678');
 });
});
