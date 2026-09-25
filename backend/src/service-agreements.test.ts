import {beforeEach,describe,expect,it,vi} from 'vitest';
import sharp from 'sharp';

const mocks=vi.hoisted(()=>({queryOne:vi.fn(),query:vi.fn(),connect:vi.fn(),sql:vi.fn(),release:vi.fn(),pdf:vi.fn(),signedPdf:vi.fn()}));
vi.mock('./db-pg',()=>({default:{connect:mocks.connect},queryOne:mocks.queryOne,query:mocks.query,run:vi.fn()}));
vi.mock('./auth',()=>({authMiddleware:vi.fn(),requirePermission:()=>vi.fn()}));
vi.mock('./email',()=>({sendEmail:vi.fn(),OUTBOUND_EMAIL_ADDRESS:'test@example.test',normalizePropertyAddress:(address:string,postcode?:string,city?:string)=>[address,city,postcode].filter(Boolean).join(', ')}));
vi.mock('./service-agreement-pdf',()=>({servicePdf:mocks.pdf,signedServicePdf:mocks.signedPdf,serviceNames:{let_only:'Let Only',rent_collection:'Rent Collection',full_management:'Full Management'}}));
vi.mock('node:fs/promises',()=>({default:{readFile:vi.fn(async()=>Buffer.from('original template')),mkdir:vi.fn(),writeFile:vi.fn(),unlink:vi.fn()}}));
import {registerServiceAgreements} from './service-agreements';

const handlers=new Map<string,any>();
const app={get:vi.fn(),post:(path:string,...callbacks:any[])=>handlers.set(path,callbacks.at(-1))};
registerServiceAgreements(app as any);
const response=()=>{const res:any={statusCode:200};res.status=vi.fn((code:number)=>{res.statusCode=code;return res;});res.json=vi.fn((data:any)=>{res.data=data;return res;});return res;};
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.connect.mockResolvedValue({query:mocks.sql,release:mocks.release});
 mocks.query.mockResolvedValue([]);
 mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('INSERT INTO landlord_service_agreements')?[{id:101,property_id:10,service_type:'let_only',status:'draft'}]:[]}));
 mocks.pdf.mockResolvedValue(Buffer.from('%PDF-test'));
 mocks.signedPdf.mockResolvedValue(Buffer.from('%PDF-signed'));
});
describe('service agreement bank confirmation',()=>{
 it.each(['let_only','rent_collection','full_management'])('creates a %s draft with no existing bank account for the landlord to complete',async(service)=>{
  mocks.queryOne.mockImplementation(async(sql:string)=>sql.includes('FROM properties')?{id:10,landlord_id:2,landlord_type:'external',service_type:service,landlord_name:'Example Owner',landlord_address:'1 Example Road',landlord_email:'owner@example.test',landlord_phone:'07700900001',address:'2 Sample Road',postcode:'AB1 2CD',rent_amount:900,entity_type:'individual'}:null);
  const res=response();
  await handlers.get('/api/properties/:id/service-agreements')({params:{id:'10'},body:{setup_fee:50,monthly_fee:10},user:{id:1,email:'staff@example.test'}},res);
  expect(res.statusCode).toBe(201);
  expect(mocks.pdf.mock.calls[0][0].bank_details).toEqual({account_name:'',bank_name:'',sort_code:'',account_number:''});
  expect(mocks.sql.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO landlord_service_agreements'))?.[1][8]).toBe(JSON.stringify({account_name:'',sort_code:'',account_number:'',bank_name:''}));
 });
 it('pre-populates an existing account even before office approval without treating it as landlord approval',async()=>{
  const bank={account_name:'Example Owner',bank_name:'Example Bank',sort_code:'12-34-56',account_number:'12345678'};
  mocks.queryOne.mockImplementation(async(sql:string)=>sql.includes('FROM properties')?{id:10,landlord_id:2,landlord_type:'external',service_type:'let_only',landlord_name:'Example Owner',landlord_address:'1 Example Road',landlord_email:'owner@example.test',landlord_phone:'07700900001',address:'2 Sample Road',rent_amount:900}:bank);
  const res=response();
  await handlers.get('/api/properties/:id/service-agreements')({params:{id:'10'},body:{setup_fee:50},user:{id:1}},res);
  expect(res.statusCode).toBe(201);expect(mocks.pdf.mock.calls[0][0].bank_details).toEqual(bank);
  expect(mocks.sql.mock.calls.some(([sql])=>sql.includes('SET landlord_approved_at'))).toBe(false);
 });
 it.each([false,undefined])('rejects signing without explicit bank confirmation (%s)',async(bankApproved)=>{
  const res=response();
  await handlers.get('/api/public/service-agreements/:token/sign')({body:{accepted_terms:true,start_immediately:true,bank_approved:bankApproved,signer_name:'Example Owner',signature:'data:image/png;base64,AAAA'},params:{token:'example'}},res);
  expect(res.statusCode).toBe(400);expect(res.data.error).toContain('bank details');expect(mocks.connect).not.toHaveBeenCalled();
 });
 it.each(['let_only','rent_collection','full_management'])('saves one signed %s PDF under the requested name on both records',async(service)=>{
  const agreement={id:101,property_id:10,landlord_id:2,service_type:service,status:'issued',details:{property_address:'2 Sample Road, Example Town, AB1 2CD'},bank_details:{},setup_fee:50,monthly_fee:10};
  mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT * FROM landlord_service_agreements')?[agreement]:sql.startsWith('SELECT landlord_id,service_type')?[{landlord_id:2,service_type:service}]:[]}));
  const signature='data:image/png;base64,'+(await sharp({create:{width:20,height:10,channels:4,background:'#222'}}).png().toBuffer()).toString('base64');
  const bank={account_name:'Example Owner',bank_name:'Example Bank',sort_code:'12-34-56',account_number:'12345678'};
  const res=response();
  await handlers.get('/api/public/service-agreements/:token/sign')({body:{accepted_terms:true,start_immediately:true,bank_approved:true,signer_name:'Example Owner',signature,bank_details:bank},params:{token:'example'},headers:{},ip:'127.0.0.1'},res);
  expect(res.statusCode).toBe(200);
  const documents=mocks.sql.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO documents')).map(([,values])=>values);
  const serviceName={let_only:'Let Only',rent_collection:'Rent Collection',full_management:'Full Management'}[service];
  expect(documents).toHaveLength(2);expect(documents.map(values=>values[0])).toEqual(['property','landlord']);
  expect(documents[0][2]).toBe(documents[1][2]);
  expect(documents[0][3]).toBe(`Service Contract - ${serviceName} - 2 Sample Road, Example Town, AB1 2CD.pdf`);
  expect(documents[1][3]).toBe(documents[0][3]);
  expect(mocks.pdf.mock.calls[0][0].bank_details).toEqual(bank);
  expect(mocks.sql.mock.calls.some(([sql])=>sql.includes('UPDATE landlord_bank_details'))).toBe(false);
 });
});
