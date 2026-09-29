import {describe,it,expect} from 'vitest';
import {parseDocumentAnalysis,checkComplianceUpdate,validIsoDate} from './flemo-document-analysis';
const item={target_key:'property:1',doc_type:'EICR',update_compliance:true,expiry_date:'2031-10-01'};
const report={doc_type:'EICR',outcome:'satisfactory',inspection_date:'2026-09-28'};
describe('Flemo document decisions',()=>{
 it('normalises missing and invalid extraction without inventing dates or people',()=>{const [a,b]=parseDocumentAnalysis('```json\n'+JSON.stringify({items:[{upload_id:'a',doc_type:'Invented',expiry_date:'2026-02-30',outcome:'probably fine'}]})+'\n```',['a','b']);expect(a).toMatchObject({target_key:'',doc_type:'Other',expiry_date:'',outcome:'unknown'});expect(b.upload_id).toBe('b');});
 it('does not treat uploading an ID as verification or a compliance update',()=>{expect(()=>checkComplianceUpdate({doc_type:'Primary Identification',update_compliance:false},{},'2026-09-29')).not.toThrow();expect(()=>checkComplianceUpdate({...item,doc_type:'Primary Identification'},report,'2026-09-29')).toThrow();});
 it('accepts a reviewed future expiry for a satisfactory property EICR',()=>{expect(()=>checkComplianceUpdate(item,report,'2026-09-29')).not.toThrow();});
 it.each(['unsatisfactory','unknown'])('keeps a %s EICR reminder open',outcome=>{expect(()=>checkComplianceUpdate(item,{...report,outcome},'2026-09-29')).toThrow();});
 it('rejects expired dates, impossible dates and future reports',()=>{for(const expiry_date of ['2026-02-30','2026-09-29','2026-09-28'])expect(()=>checkComplianceUpdate({...item,expiry_date},report,'2026-09-29')).toThrow();expect(()=>checkComplianceUpdate(item,{...report,inspection_date:'2027-01-01'},'2026-09-29')).toThrow();expect(validIsoDate('2028-02-29')).toBe(true);});
 it('rejects a report repurposed to a different certificate type or person',()=>{expect(()=>checkComplianceUpdate({...item,doc_type:'EPC'},report,'2026-09-29')).toThrow();expect(()=>checkComplianceUpdate({...item,target_key:'tenant:1'},report,'2026-09-29')).toThrow();});
 it('does not clear a gas reminder for an expressly unsatisfactory report',()=>{expect(()=>checkComplianceUpdate({...item,doc_type:'Gas Safety Certificate'},{...report,doc_type:'Gas Safety Certificate',outcome:'unsatisfactory'},'2026-09-29')).toThrow();});
});
