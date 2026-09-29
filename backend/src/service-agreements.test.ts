import {beforeEach,describe,expect,it,vi} from 'vitest';
import sharp from 'sharp';

const mocks=vi.hoisted(()=>({queryOne:vi.fn(),query:vi.fn(),connect:vi.fn(),sql:vi.fn(),release:vi.fn(),pdf:vi.fn(),signedPdf:vi.fn(),sendEmail:vi.fn(),sendSms:vi.fn(),run:vi.fn()}));
vi.mock('./sms',()=>({sendSms:mocks.sendSms,normalizeUkPhone:(phone:string)=>phone,SMS_FROM:'Fleming'}));
vi.mock('./db-pg',()=>({default:{connect:mocks.connect},queryOne:mocks.queryOne,query:mocks.query,run:vi.fn()}));
vi.mock('./auth',()=>({authMiddleware:vi.fn(),requirePermission:()=>vi.fn()}));
vi.mock('./email',()=>({sendEmail:mocks.sendEmail,completedLandlordAgreementEmail:()=>({subject:'Your signed agreement',html:'<p>Signed copy attached</p>'}),OUTBOUND_EMAIL_ADDRESS:'test@example.test',normalizePropertyAddress:(address:string,postcode?:string,city?:string)=>[address,city,postcode].filter(Boolean).join(', ')}));
vi.mock('./service-agreement-pdf',()=>({servicePdf:mocks.pdf,signedServicePdf:mocks.signedPdf,serviceNames:{let_only:'Let Only',rent_collection:'Rent Collection',full_management:'Full Management'}}));
vi.mock('node:fs/promises',()=>({default:{readFile:vi.fn(async()=>Buffer.from('original template')),mkdir:vi.fn(),writeFile:vi.fn(),unlink:vi.fn(async()=>{})}}));
import {registerServiceAgreements} from './service-agreements';
import {serviceSigningUrl} from './service-agreement-links';

const handlers=new Map<string,any>();
const linkMiddleware=new Map<string,any>();
const app={get:vi.fn(),post:(path:string,...callbacks:any[])=>{handlers.set(path,callbacks.at(-1));linkMiddleware.set(path,callbacks.at(-2));}};
registerServiceAgreements(app as any);
const response=()=>{const res:any={statusCode:200};res.status=vi.fn((code:number)=>{res.statusCode=code;return res;});res.json=vi.fn((data:any)=>{res.data=data;return res;});return res;};
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.sendEmail.mockResolvedValue({success:true,id:'test-message'});
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
  expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({idempotencyKey:'completed-service-101',attachments:[expect.objectContaining({content:Buffer.from('%PDF-signed'),contentType:'application/pdf'})]}));
  expect(mocks.sql.mock.invocationCallOrder[mocks.sql.mock.calls.findIndex(([sql])=>sql==='COMMIT')]).toBeLessThan(mocks.sendEmail.mock.invocationCallOrder[0]);
  const documents=mocks.sql.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO documents')).map(([,values])=>values);
  const serviceName={let_only:'Let Only',rent_collection:'Rent Collection',full_management:'Full Management'}[service];
  expect(documents).toHaveLength(2);expect(documents.map(values=>values[0])).toEqual(['property','landlord']);
  expect(documents[0][2]).toBe(documents[1][2]);
  expect(documents[0][3]).toBe(`Service Contract - ${serviceName} - 2 Sample Road, Example Town, AB1 2CD.pdf`);
  expect(documents[1][3]).toBe(documents[0][3]);
  expect(mocks.pdf.mock.calls[0][0].bank_details).toEqual(bank);
  const savedBank=mocks.sql.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO landlord_bank_details'));
  expect(savedBank?.[1]).toEqual([2,bank.account_name,bank.sort_code,bank.account_number,bank.bank_name,expect.any(String),'Example Owner',true]);
  const bankLogs=mocks.sql.mock.calls.filter(([sql])=>sql.includes('INSERT INTO audit_log(user_email,action'));
  expect(bankLogs.map(([,values])=>values[2])).toEqual(['landlord','property']);
  expect(bankLogs[0][1][1]).toBe('bank_details_updated');
  expect(bankLogs[0][1][4]).toContain('****5678');
  expect(bankLogs[0][1][4]).not.toContain('12345678');
 });
 it('replaces a previously held master account only during successful signing',async()=>{
  const old={account_name:'Old Owner',bank_name:'Old Bank',sort_code:'11-22-33',account_number:'99887766'};
  const agreement={id:101,property_id:10,landlord_id:2,service_type:'let_only',status:'issued',details:{property_address:'2 Sample Road'},bank_details:old,setup_fee:50};
  mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT * FROM landlord_service_agreements')?[agreement]:sql.startsWith('SELECT landlord_id,service_type')?[{landlord_id:2,service_type:'let_only'}]:sql.startsWith('SELECT * FROM landlord_bank_details')?[old]:[]}));
  const signature='data:image/png;base64,'+(await sharp({create:{width:20,height:10,channels:4,background:'#222'}}).png().toBuffer()).toString('base64');
  const res=response();await handlers.get('/api/public/service-agreements/:token/sign')({params:{token:'example'},body:{signature,signer_name:'New Owner',accepted_terms:true,bank_approved:true,start_immediately:true,bank_details:{account_name:'New Owner',bank_name:'New Bank',sort_code:'44-55-66',account_number:'12345678'}},headers:{},ip:'127.0.0.1'},res);
  expect(res.statusCode).toBe(200);const upsert=mocks.sql.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO landlord_bank_details'));
  expect(upsert?.[1].slice(0,5)).toEqual([2,'New Owner','44-55-66','12345678','New Bank']);
  const log=mocks.sql.mock.calls.find(([sql])=>sql.includes('INSERT INTO audit_log(user_email,action'));
  const changes=JSON.parse(log![1][4]);expect(changes.bank_details.from.account_number).toBe('****7766');expect(changes.confirmed_by).toBe('New Owner');
  expect(mocks.sql.mock.calls.at(-1)?.[0]).toBe('COMMIT');
 });
 it('renders a draft signature without bank confirmation or writes to CRM records',async()=>{
  mocks.queryOne.mockResolvedValue({id:101,service_type:'let_only',status:'issued',details:{property_address:'2 Sample Road'},bank_details:{}});
  const signature='data:image/png;base64,'+(await sharp({create:{width:20,height:10,channels:4,background:'#222'}}).png().toBuffer()).toString('base64');
  const res=response();res.type=vi.fn(()=>res);res.set=vi.fn(()=>res);res.send=vi.fn(()=>res);
  await handlers.get('/api/public/service-agreements/:token/preview')({params:{token:'example'},body:{signature,signer_name:'Example Owner',bank_details:{account_name:'Example Owner',bank_name:'Example Bank',sort_code:'12-34-56',account_number:'12345678'}},ip:'127.0.0.1'},res);
  expect(res.statusCode).toBe(200);expect(mocks.signedPdf).toHaveBeenCalledWith(expect.any(Buffer),expect.objectContaining({signer_name:'Example Owner'}),true);
  expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.sql).not.toHaveBeenCalled();
 });
});

describe('property contract delivery and overrides',()=>{
 const agreement=()=>({id:101,property_id:10,landlord_id:2,service_type:'let_only',status:'draft',filename:'example.pdf',token:'example',details:{landlord_name:'Example Owner',landlord_email:'owner@example.test',landlord_phone:'07700900001',property_address:'2 Sample Road'}});
 const req=(body:any)=>({params:{id:'101'},body,user:{id:1,email:'office@example.test',role:'admin'}});
 it('does not send without a selected channel',async()=>{const res=response();await handlers.get('/api/service-agreements/:id/send')(req({send_email:false,send_sms:false}),res);expect(res.statusCode).toBe(400);expect(mocks.connect).not.toHaveBeenCalled();});
 it('sends SMS only and stores the issued copy on both records',async()=>{mocks.sendSms.mockResolvedValue({success:true,sid:'example'});mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT * FROM landlord_service_agreements')?[agreement()]:[]}));const res=response();await handlers.get('/api/service-agreements/:id/send')(req({send_email:false,send_sms:true}),res);expect(res.statusCode).toBe(200);expect(mocks.sendEmail).not.toHaveBeenCalled();expect(mocks.sendSms).toHaveBeenCalledWith(expect.objectContaining({to:'07700900001',body:expect.stringContaining('token=example')}));expect(mocks.sql.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO documents'))).toHaveLength(2);expect(mocks.sql.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO audit_log'))?.[1][4]).toContain('"status":"issued"');});
 it('keeps an unsent draft when all channels fail',async()=>{mocks.sendSms.mockResolvedValue({success:false,error:'SMS unavailable'});mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT * FROM landlord_service_agreements')?[agreement()]:[]}));const res=response();await handlers.get('/api/service-agreements/:id/send')(req({send_email:false,send_sms:true}),res);expect(res.statusCode).toBe(502);expect(mocks.sql.mock.calls.find(([sql])=>sql.startsWith('UPDATE landlord_service_agreements'))?.[1]).toEqual([101,false,'failed','SMS unavailable',expect.any(String)]);expect(mocks.sql.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO documents'))).toBe(false);});
 it('rejects non-admin overrides and requires a reason',async()=>{const res=response(),r=req({reason:'Confirmed by office'});r.user.role='staff';await handlers.get('/api/properties/:id/service-agreement-override')(r,res);expect(res.statusCode).toBe(403);const missing=response();await handlers.get('/api/properties/:id/service-agreement-override')(req({reason:''}),missing);expect(missing.statusCode).toBe(400);});
 it('scopes an override to one property and leaves the landlord pipeline and contract unsigned',async()=>{mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT p.*')?[{id:10,landlord_id:2,service_type:'let_only'}]:[]}));const res=response();await handlers.get('/api/properties/:id/service-agreement-override')(req({reason:'Existing offline agreement verified'}),res);expect(res.statusCode).toBe(200);expect(mocks.sql.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO property_service_overrides'))?.[1]).toEqual([10,2,'let_only','Existing offline agreement verified',1]);expect(mocks.sql.mock.calls.some(([sql])=>sql.includes('UPDATE landlord_service_agreements')||sql.includes('UPDATE bdm'))).toBe(false);});
});


describe('draft fee editing',()=>{
 const draft={id:101,property_id:10,landlord_id:2,service_type:'full_management',status:'draft',setup_fee:75,monthly_fee:12,details:{},bank_details:{}};
 const req=(body:any)=>({params:{id:'101'},body,user:{id:1,email:'office@example.test'}});
 it.each(['issued','signed','void'])('refuses fee edits after %s',async(status)=>{mocks.sql.mockResolvedValue({rows:[{...draft,status}]});const res=response();await handlers.get('/api/service-agreements/:id/fees')(req({setup_fee:50,monthly_fee:10}),res);expect(res.statusCode).toBe(409);expect(mocks.pdf).not.toHaveBeenCalled();});
 it('rejects invalid percentages',async()=>{mocks.sql.mockResolvedValue({rows:[draft]});const res=response();await handlers.get('/api/service-agreements/:id/fees')(req({setup_fee:101,monthly_fee:10}),res);expect(res.statusCode).toBe(400);expect(mocks.pdf).not.toHaveBeenCalled();});
 it('regenerates the draft PDF and audits saved rates before sending',async()=>{mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT * FROM landlord_service_agreements')?[{...draft}]:sql.startsWith('SELECT landlord_id,service_type')?[{landlord_id:2,service_type:'full_management'}]:[]}));const res=response();await handlers.get('/api/service-agreements/:id/fees')(req({setup_fee:50,monthly_fee:10}),res);expect(res.statusCode).toBe(200);expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({setup_fee:50,monthly_fee:10}));expect(mocks.sql.mock.calls.find(([sql])=>sql.startsWith('UPDATE landlord_service_agreements'))?.[1]).toEqual([101,50,10,expect.stringMatching(/\.pdf$/)]);expect(mocks.sql.mock.calls.some(([sql])=>sql.includes('service_agreement_fees_updated'))).toBe(true);expect(mocks.sendEmail).not.toHaveBeenCalled();});
});

describe('short service link access',()=>{
 it('resolves a valid contract ID and secret before signing',async()=>{
  const token='ab'.repeat(32),value=new URL(serviceSigningUrl({id:1,token,details:{landlord_name:'Test Owner'}})).pathname.slice(1);
  mocks.queryOne.mockResolvedValue({token});
  const req={params:{token:value}},res=response(),next=vi.fn();
  await linkMiddleware.get('/api/public/service-agreements/:token/sign')(req,res,next);
  expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('id=$1 AND LEFT(token,32)=$2'),[1,token.slice(0,32)]);
  expect(req.params.token).toBe(token);expect(next).toHaveBeenCalledOnce();
 });
 it('rejects a wrong access code without reaching the signing handler',async()=>{
  const value=new URL(serviceSigningUrl({id:1,token:'cd'.repeat(32)})).pathname.slice(1);
  mocks.queryOne.mockResolvedValue(null);const next=vi.fn(),res=response();
  await linkMiddleware.get('/api/public/service-agreements/:token/sign')({params:{token:value}},res,next);
  expect(res.statusCode).toBe(404);expect(next).not.toHaveBeenCalled();
 });
 it('keeps original token links working',async()=>{
  const next=vi.fn(),res=response(),req={params:{token:'ef'.repeat(32)}};
  await linkMiddleware.get('/api/public/service-agreements/:token/sign')(req,res,next);
  expect(next).toHaveBeenCalledOnce();expect(mocks.queryOne).not.toHaveBeenCalled();
 });
});

describe('unsigned service choice changes',()=>{
 const request={params:{id:'26'},body:{service_type:'let_only',expected_service_type:'full_management',setup_fee:75,monthly_fee:10},user:{id:1,email:'staff@example.test'}};
 const property={id:26,landlord_type:'external',service_type:'full_management',service_setup_fee:50,service_monthly_fee:10,has_live_tenancy:0};
 const setup=(status='draft',issuedAst=false,live=false)=>mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT p.*')?[{...property,has_live_tenancy:live?1:0}]:sql.startsWith('SELECT * FROM landlord_service_agreements')?[{id:101,status}]:sql.startsWith('SELECT id FROM tenancy_agreements')&&issuedAst?[{id:12}]:sql.startsWith('UPDATE landlord_service_agreements')?[{id:101}]:[]}));
 it.each(['draft','issued'])('voids the %s contract, sets Let Only fees and logs the user',async status=>{
  setup(status);const res=response();await handlers.get('/api/properties/:id/service-choice')(request,res);
  expect(res.statusCode).toBe(200);expect(res.data.voided_agreements).toEqual([101]);
  expect(mocks.sql.mock.calls.find(([sql])=>sql.startsWith('UPDATE properties SET service_type'))?.[1]).toEqual([26,'let_only',75,0,75]);
  const audit=mocks.sql.mock.calls.find(([sql])=>sql.includes("'service_type_changed'"));expect(audit?.[1].slice(0,3)).toEqual([1,'staff@example.test',26]);
  expect(mocks.sendEmail).not.toHaveBeenCalled();expect(mocks.sql.mock.calls.at(-1)?.[0]).toBe('COMMIT');
 });
 it.each([['signed',false,false],['draft',true,false],['draft',false,true]])('refuses locked work (%s, AST %s, active %s)',async(status,ast,live)=>{
  setup(String(status),Boolean(ast),Boolean(live));const res=response();await handlers.get('/api/properties/:id/service-choice')(request,res);
  expect(res.statusCode).toBe(409);expect(mocks.sql.mock.calls.some(([sql])=>sql.startsWith('UPDATE '))).toBe(false);
 });
 it('rejects stale service choices and invalid fees before changing anything',async()=>{
  setup();const stale=response();await handlers.get('/api/properties/:id/service-choice')({...request,body:{...request.body,expected_service_type:'rent_collection'}},stale);expect(stale.statusCode).toBe(409);
  const invalid=response();await handlers.get('/api/properties/:id/service-choice')({...request,body:{...request.body,setup_fee:101}},invalid);expect(invalid.statusCode).toBe(400);
  expect(mocks.sql.mock.calls.some(([sql])=>sql.startsWith('UPDATE '))).toBe(false);
 });
});

describe('discarding an unsent draft',()=>{
 const request={params:{id:'101'},user:{id:1,email:'office@example.test'}};
 it('removes the visible draft while retaining an audit and never sends or creates a document',async()=>{
  mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT *')?[{id:101,property_id:26,service_type:'full_management',status:'draft'}]:[]}));
  const res=response();await handlers.get('/api/service-agreements/:id/discard-draft')(request,res);
  expect(res.statusCode).toBe(200);expect(mocks.sql.mock.calls.some(([sql])=>sql.includes('discarded_draft'))).toBe(true);expect(mocks.sql.mock.calls.some(([,params])=>params?.includes('service_agreement_draft_discarded'))).toBe(true);expect(mocks.sql.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO documents'))).toBe(false);expect(mocks.sendEmail).not.toHaveBeenCalled();expect(mocks.pdf).not.toHaveBeenCalled();
 });
 it.each([{status:'issued'},{status:'signed'},{status:'draft',issued_at:'2026-09-29'},{status:'draft',signed_at:'2026-09-29'}])('refuses previously issued/signed records %j',async(record)=>{
  mocks.sql.mockResolvedValue({rows:[{id:101,...record}]});const res=response();await handlers.get('/api/service-agreements/:id/discard-draft')(request,res);expect(res.statusCode).toBe(409);expect(mocks.sql.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 });
});

it('previews a signature with blank bank details and all confirmations false without saving',async()=>{
 mocks.queryOne.mockResolvedValue({id:101,status:'issued',service_type:'full_management',issued_at:'2026-09-29T10:00:00Z',details:{property_address:'Example'},bank_details:{}});
 const signature='data:image/png;base64,'+(await sharp({create:{width:20,height:10,channels:4,background:'#222'}}).png().toBuffer()).toString('base64');
 const res=response();res.type=vi.fn(()=>res);res.set=vi.fn(()=>res);res.send=vi.fn(()=>res);
 await handlers.get('/api/public/service-agreements/:token/preview')({params:{token:'example'},body:{signature,signer_name:'Example Owner',bank_details:{account_name:'',bank_name:'',sort_code:'',account_number:''},accepted_terms:false,bank_approved:false,start_immediately:false}},res);
 expect(res.statusCode).toBe(200);expect(mocks.signedPdf).toHaveBeenCalled();expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.sql).not.toHaveBeenCalled();
});
