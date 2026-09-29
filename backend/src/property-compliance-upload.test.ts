import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),release:vi.fn(),connect:vi.fn(),exists:vi.fn(),read:vi.fn(),remove:vi.fn()}));
vi.mock('./db-pg',()=>({default:{connect:mocks.connect}}));
vi.mock('fs',()=>({default:{existsSync:mocks.exists,readFileSync:mocks.read,rmSync:mocks.remove}}));
import {savePropertyCompliance} from './property-compliance-upload';
const file={filename:'new.pdf',originalname:'EPC.pdf',mimetype:'application/pdf',size:20} as Express.Multer.File;
const input={propertyId:26,docType:'EPC',expiryDate:'2036-09-28',file,user:{id:1,email:'admin@example.test'},uploadsDir:'test-uploads'};
let existing:any=null,failUpdate=false;
beforeEach(()=>{
 vi.clearAllMocks();existing=null;failUpdate=false;
 mocks.connect.mockResolvedValue({query:mocks.query,release:mocks.release});
 mocks.exists.mockReturnValue(true);mocks.read.mockReturnValue(Buffer.from('same certificate'));
 mocks.query.mockImplementation(async(sql:string,values:any[])=>{
  if(sql.startsWith('SELECT * FROM properties'))return {rows:[{id:26,epc_expiry_date:'2026-09-01'}]};
  if(sql.startsWith('SELECT id FROM tenant_enquiries'))return {rows:values[0]===84?[{id:84}]:[]};
  if(sql.startsWith('SELECT * FROM documents'))return {rows:existing?[existing]:[]};
  if(sql.startsWith('INSERT INTO documents'))return {rows:[{id:901,original_name:file.originalname}]};
  if(sql.startsWith('UPDATE properties')&&failUpdate)throw Error('Database update failed');
  return {rows:[]};
 });
});
describe('save compliance directly to the property',()=>{
 it.each([['EPC','epc_expiry_date'],['EICR','eicr_expiry_date'],['Gas Safety Certificate','gas_safety_expiry_date']])('saves %s and its expiry in one transaction',async(docType,field)=>{
  const result=await savePropertyCompliance({...input,docType});
  expect(result.property_id).toBe(26);
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("VALUES('property'"),[26,docType,'new.pdf','EPC.pdf','application/pdf',20,1]);
  expect(mocks.query).toHaveBeenCalledWith(`UPDATE properties SET ${field}=$1,updated_at=NOW() WHERE id=$2`,['2036-09-28',26]);
  expect(mocks.query).toHaveBeenCalledWith('COMMIT');expect(mocks.remove).not.toHaveBeenCalled();
 });
 it('rolls back the document if saving the expiry fails and cleans up the unused file',async()=>{
  failUpdate=true;await expect(savePropertyCompliance(input)).rejects.toThrow('Database update failed');
  expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');expect(mocks.query).not.toHaveBeenCalledWith('COMMIT');expect(mocks.remove).toHaveBeenCalled();
 });
 it('requires a real date before storing the document',async()=>{
  await expect(savePropertyCompliance({...input,expiryDate:'2026-02-30'})).rejects.toThrow('valid expiry');expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.remove).toHaveBeenCalled();
 });
 it('reuses an identical current file only for the same property and category',async()=>{
  existing={id:50,filename:'current.pdf',original_name:'current.pdf'};
  const result=await savePropertyCompliance(input);expect(result.duplicate).toBe(true);expect(result.document.id).toBe(50);
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('doc_type=$2'),[26,'EPC']);expect(mocks.query.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO documents'))).toBe(false);expect(mocks.remove).toHaveBeenCalled();
 });
 it('can correct the expiry without uploading the same certificate again',async()=>{
  existing={id:50,filename:'current.pdf',original_name:'current.pdf'};
  const result=await savePropertyCompliance({...input,file:undefined});expect(result.document.id).toBe(50);expect(mocks.query).toHaveBeenCalledWith('COMMIT');expect(mocks.remove).not.toHaveBeenCalled();
 });
 it('does not allow an empty document to mark compliance as saved',async()=>{
  await expect(savePropertyCompliance({...input,file:undefined})).rejects.toThrow('Choose a document');expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
 });
 it('records who uploaded the report, the linked onboarding enquiry and both expiry dates',async()=>{
  await savePropertyCompliance({...input,enquiryId:84});
  const call=mocks.query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO audit_log'))!;
  expect(call[1].slice(0,3)).toEqual([1,'admin@example.test',26]);
  expect(JSON.parse(call[1][3])).toMatchObject({source:'Tenant onboarding',stage:'Tenancy Agreement',enquiry_id:84,operation:'uploaded',expiry_date:{from:'2026-09-01',to:'2036-09-28'}});
 });
 it('rejects an onboarding enquiry that is not linked to this property',async()=>{
  await expect(savePropertyCompliance({...input,enquiryId:99})).rejects.toThrow('not linked');expect(mocks.query).not.toHaveBeenCalledWith('COMMIT');expect(mocks.remove).toHaveBeenCalled();
 });
});
