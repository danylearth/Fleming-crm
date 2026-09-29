import {beforeEach,it,expect,vi} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
const fixture=vi.hoisted(()=>({request:null as any,recipients:[] as any[],emails:[] as any[],documents:[] as any[],audits:[] as any[],outbox:[] as any[]}));
vi.mock('./auth',()=>({authMiddleware:()=>{},requirePermission:()=>()=>{}}));
vi.mock('./email',async()=>({...await vi.importActual<any>('./email'),sendEmail:vi.fn(async(message:any)=>{fixture.emails.push(message);return {success:true,id:'test-delivery-id'};})}));
vi.mock('node:fs/promises',async()=>{const actual=await vi.importActual<any>('node:fs/promises');return {...actual,default:{...actual.default,mkdir:vi.fn(),writeFile:vi.fn()}};});
vi.mock('./signature-recipients',async()=>({...await vi.importActual<any>('./signature-recipients'),connectedSignatureRecipients:async()=>fixture.recipients.map(r=>({...r,key:`tenant:${r.entity_id}:primary`}))}));
vi.mock('./db-pg',()=>{
 const execute=async(sql:string,args:any[]=[])=>{
  if(sql.startsWith('INSERT INTO signature_completion_emails')){if(!fixture.outbox.some(e=>e.recipient_id===args[0]))fixture.outbox.push({recipient_id:args[0],to_email:args[1],subject:args[2],body_html:args[3],status:'pending',attempts:0});return {rows:[]};}
  if(sql.startsWith('SELECT e.*')){const e=fixture.outbox.find(e=>e.status==='pending'&&!e.deferred);return {rows:e&&fixture.request.status==='completed'&&fixture.recipients.every(r=>r.signed_at)?[{...fixture.request,...fixture.recipients.find(r=>r.id===e.recipient_id),...e}]:[]};}
  if(sql.startsWith('UPDATE signature_completion_emails SET status=$2')){Object.assign(fixture.outbox.find(e=>e.recipient_id===args[0]),{status:args[1],deferred:true});return {rows:[]};}
  if(sql.startsWith('SELECT * FROM signature_requests'))return {rows:[fixture.request]};
  if(sql.startsWith('SELECT * FROM signature_recipients WHERE request_id'))return {rows:fixture.recipients};
  if(sql.startsWith('SELECT * FROM signature_recipients WHERE token'))return {rows:fixture.recipients.filter(r=>r.token===args[0]||r.signing_slug===args[0])};
  if(sql.startsWith('SELECT * FROM signature_recipients WHERE id'))return {rows:fixture.recipients.filter(r=>r.id===args[0])};
  if(sql.startsWith('UPDATE signature_requests SET fields=$1,title=$3'))Object.assign(fixture.request,{fields:JSON.parse(args[0]),title:args[2],subject:args[3],message:args[4]});
  else if(sql.startsWith('UPDATE signature_requests SET fields'))Object.assign(fixture.request,{fields:JSON.parse(args[0]),subject:args[1],message:args[2],title:args[4],status:'sent',sent_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000)});
  if(sql.startsWith('UPDATE signature_recipients SET signed_at'))Object.assign(fixture.recipients.find(r=>r.id===args[2]),{signed_at:new Date().toISOString(),signature:args[0],signing_ip:args[1],initials:args[3],consent_snapshot:args[4]?JSON.parse(args[4]):null});
  if(sql.includes("SET status='completed'"))Object.assign(fixture.request,{status:'completed',signed_pdf:args[0],completed_at:new Date().toISOString()});
  if(sql.includes("'signature_request_sent'"))fixture.audits.push({entity_type:args[2],entity_id:args[3],changes:JSON.parse(args[4])});
  if(sql.startsWith('INSERT INTO documents'))fixture.documents.push({entity_type:args[0],entity_id:args[1],filename:args[2],original_name:args[3],size:args[4]});
  return {rows:[]};
 };
 return {default:{connect:async()=>({query:execute,release:()=>{}})},query:async(sql:string)=>sql.includes('FROM tenants WHERE id=ANY')?fixture.recipients.filter(r=>r.entity_type==='tenant').map(r=>({...r,id:r.entity_id})):sql.includes('FROM landlords WHERE id=ANY')?fixture.recipients.filter(r=>r.entity_type==='landlord').map(r=>({...r,id:r.entity_id,entity_type:'company'})):[{...fixture.request,recipients:fixture.recipients}],queryOne:async(sql:string,args:any[]=[])=>{if(sql.startsWith('UPDATE signature_recipients SET signing_slug')){const r=fixture.recipients.find(r=>r.id===args[0]);r.signing_slug ||=args[1];return {signing_slug:r.signing_slug};}return sql.includes('FROM signature_recipients r JOIN signature_requests')?{...fixture.request,...fixture.recipients.find(r=>r.token===args[0]||r.signing_slug===args[0])}:fixture.request;},run:async()=>({})};
});
import {SIGNING_CONSENT_VERSION} from './signing-consent';
const acceptedConsents={consentVersion:SIGNING_CONSENT_VERSION,acknowledgements:{terms:true,legalEffect:true,declaration:true}};
import {registerDocumentSigning} from './document-signing';
import {inlineEmailImages,sendEmail} from './email';
import {deliverCompletedDocumentEmails} from './document-signing-email';
const handlers=new Map<string,any>();registerDocumentSigning({get:(p:string,...h:any[])=>handlers.set('GET '+p,h.at(-1)),post:(p:string,...h:any[])=>handlers.set('POST '+p,h.at(-1))} as any);
const call=async(route:string,body:any={},params:any={})=>{let status=200,data:any;const res:any={status:(s:number)=>{status=s;return res;},json:(d:any)=>{data=d;return res;}};await handlers.get(route)({body,params,user:{id:1,email:'test@example.test'},ip:'127.0.0.1'},res);return {status,data};};
beforeEach(async()=>{const pdf=await PDFDocument.create();pdf.addPage([600,800]);fixture.request={id:21,entity_type:'tenant',entity_id:9001,status:'draft',title:'Original',pages:[{width:600,height:800}],source_pdf:Buffer.from(await pdf.save()),source_sha256:'testhash',created_by:1};fixture.recipients=[9001,9003].map((id,i)=>({id:i+1,entity_id:id,entity_type:'tenant',recipient_slot:'primary',name:i?'Casey Test':'Jamie Test',email:`person${i}@example.test`,token:String(i+1).repeat(64),request_id:21}));fixture.emails=[];fixture.documents=[];fixture.audits=[];fixture.outbox=[];vi.mocked(sendEmail).mockClear();});
it('sends personalised HTML, records date sent, then publishes the completed PDF to both records',async()=>{
 const fields=fixture.recipients.map((r,i)=>({recipient_id:r.id,page:0,x:.1,y:.4+i*.2,width:.3,height:.08}));
 const preview=await call('POST /api/signature-requests/preview',{entity:'tenant',entity_id:9001,title:'Inventory TEST',subject:'TEST invitation',message:'Read this.\nFictional only.',recipients:fixture.recipients});
 expect(preview.status).toBe(200);expect(preview.data.previews[0].html).toContain('Hi there Jamie');
 const sent=await call('POST /api/signature-requests/:id/send',{fields,title:'Inventory TEST',subject:'TEST invitation',message:'Read this.\nFictional only.'},{id:21});
 expect(sent.data.success).toBe(true);expect(fixture.emails).toHaveLength(2);expect(fixture.request.status).toBe('sent');expect(Date.parse(fixture.request.sent_at)).not.toBeNaN();
 for(const [i,email] of fixture.emails.entries()){expect(email.html).toContain(fixture.recipients[i].signing_slug);expect(email.html).not.toContain(fixture.recipients[i].token);expect(email.html).toContain('Inventory TEST');expect(email.html).toContain('Read this.<br>Fictional only.');expect(inlineEmailImages(email.html).attachments).toHaveLength(7);}
 const signature='data:image/png;base64,'+(await sharp(Buffer.from('<svg width="200" height="70"><path d="M10 50 L50 10 L70 50 L160 20" stroke="black" stroke-width="4" fill="none"/></svg>')).png().toBuffer()).toString('base64');
 const first=await call('POST /api/public/sign-documents/:token/sign',{...acceptedConsents,consent:true,signature},{token:fixture.recipients[0].token});expect(first.data.completed).toBe(false);expect(fixture.outbox).toHaveLength(0);expect(fixture.emails).toHaveLength(2);expect(fixture.documents).toHaveLength(0);expect(fixture.recipients[0].signed_at).toBeTruthy();expect(fixture.request.status).toBe('sent');
 const second=await call('POST /api/public/sign-documents/:token/sign',{...acceptedConsents,consent:true,signature},{token:fixture.recipients[1].signing_slug});expect(second.data.completed).toBe(true);expect(fixture.request.status).toBe('completed');expect(fixture.request.signed_pdf.subarray(0,4).toString()).toBe('%PDF');expect(fixture.documents.map(d=>d.entity_id)).toEqual([9001,9003]);expect(fixture.documents[0].original_name).toBe('Inventory TEST - Signed.pdf');const completed=await call('GET /api/public/sign-documents/:token',{}, {token:fixture.recipients[0].token});expect(completed.data.pages).toHaveLength(3);expect(fixture.recipients.every(r=>r.signing_ip==='127.0.0.1')).toBe(true);
 const copies=fixture.emails.slice(2);expect(copies).toHaveLength(2);expect(copies.map(e=>e.to)).toEqual(['person0@example.test','person1@example.test']);
 for(const email of copies){expect(email.html).toContain('All done');expect(email.attachments).toHaveLength(1);expect(email.attachments[0].content).toEqual(fixture.request.signed_pdf);expect((await PDFDocument.load(email.attachments[0].content)).getPageCount()).toBe(3);}
 expect(fixture.outbox.every(e=>e.status==='sent')).toBe(true);await deliverCompletedDocumentEmails();expect(fixture.emails).toHaveLength(4);
});
it('does not send when a selected signer has no signature field',async()=>{const result=await call('POST /api/signature-requests/:id/send',{fields:[{recipient_id:1,page:0,x:.1,y:.4,width:.3,height:.08}],title:'TEST',subject:'TEST',message:'TEST'},{id:21});expect(result.status).toBe(400);expect(fixture.emails).toHaveLength(0);expect(fixture.request.status).toBe('draft');});

it('previews and sends to explicitly selected tenants, landlords and companies together',async()=>{
 fixture.recipients.push({id:3,entity_id:77,entity_type:'landlord',recipient_slot:'primary',name:'Example Ltd',email:'office@example.test',token:'3'.repeat(64),request_id:21});
 const preview=await call('POST /api/signature-requests/preview',{entity:'tenant',entity_id:9001,title:'Mixed recipients',subject:'Review',message:'Review this document.',recipients:fixture.recipients});expect(preview.status).toBe(200);expect(preview.data.previews).toHaveLength(3);
 const sent=await call('POST /api/signature-requests/:id/send',{fields:fixture.recipients.map((r,i)=>({recipient_id:r.id,page:0,x:.1,y:.2+i*.2,width:.3,height:.08})),title:'Mixed recipients',subject:'Review',message:'Review this document.'},{id:21});expect(sent.data.success).toBe(true);expect(fixture.emails.map(e=>e.to)).toEqual(['person0@example.test','person1@example.test','office@example.test']);expect(fixture.audits.map(a=>a.entity_type+':'+a.entity_id)).toEqual(['tenant:9001','tenant:9003','landlord:77']);expect(fixture.audits.every(a=>a.changes.title==='Mixed recipients')).toBe(true);
});

it('requires initials when requested and stores them with the signature',async()=>{fixture.request.status='sent';fixture.request.expires_at=new Date(Date.now()+86400000);fixture.request.fields=[{recipient_id:1,page:0,x:.1,y:.2,width:.3,height:.08,type:'signature'},{recipient_id:1,page:0,x:.1,y:.4,width:.1,height:.04,type:'initials'}];const signature='data:image/png;base64,'+(await sharp({create:{width:80,height:20,channels:4,background:'#111'}}).png().toBuffer()).toString('base64');const missing=await call('POST /api/public/sign-documents/:token/sign',{...acceptedConsents,signature,consent:true},{token:fixture.recipients[0].token});expect(missing.status).toBe(400);expect(fixture.recipients[0].signed_at).toBeFalsy();const signed=await call('POST /api/public/sign-documents/:token/sign',{...acceptedConsents,signature,initials:signature,consent:true},{token:fixture.recipients[0].token});expect(signed.data.success).toBe(true);expect(Buffer.isBuffer(fixture.recipients[0].initials)).toBe(true);});

it('saves the entered document name and field layout without sending the draft',async()=>{const result=await call('POST /api/signature-requests/:id/fields',{fields:[{recipient_id:1,page:0,x:.1,y:.4,width:.3,height:.08}],title:'EICR Report',subject:'Review EICR',message:'Please sign'},{id:21});expect(result.status).toBe(200);expect(fixture.request.title).toBe('EICR Report');expect(fixture.request.status).toBe('draft');expect(fixture.request.fields).toHaveLength(1);expect(fixture.emails).toHaveLength(0);});

it('saves on tenant and landlord records and retries only failed completed-copy emails',async()=>{
 fixture.request.status='sent';fixture.request.expires_at=new Date(Date.now()+86400000);
 fixture.recipients[1].entity_type='landlord';
 fixture.request.fields=fixture.recipients.map((r,i)=>({recipient_id:r.id,type:'signature',page:0,x:.1,y:.3+i*.2,width:.3,height:.08}));
 const signature='data:image/png;base64,'+(await sharp({create:{width:80,height:20,channels:4,background:'#111'}}).png().toBuffer()).toString('base64');
 await call('POST /api/public/sign-documents/:token/sign',{...acceptedConsents,signature,consent:true},{token:fixture.recipients[0].token});
 vi.mocked(sendEmail).mockResolvedValueOnce({success:false,error:'Temporary delivery failure'});
 const completed=await call('POST /api/public/sign-documents/:token/sign',{...acceptedConsents,signature,consent:true},{token:fixture.recipients[1].token});
 expect(completed.data.completed).toBe(true);expect(fixture.documents.map(d=>d.entity_type)).toEqual(['tenant','landlord']);
 expect(fixture.outbox.map(e=>e.status)).toEqual(['pending','sent']);
 fixture.outbox[0].deferred=false;
 const before=vi.mocked(sendEmail).mock.calls.length;await deliverCompletedDocumentEmails();
 expect(vi.mocked(sendEmail).mock.calls.length).toBe(before+1);expect(fixture.outbox.every(e=>e.status==='sent')).toBe(true);
 expect(vi.mocked(sendEmail).mock.calls.at(-1)![0].to).toBe('person0@example.test');
 expect(vi.mocked(sendEmail).mock.calls.at(-1)![0].idempotencyKey).toBe('signed-document-21-1');
});

it('saves the accepted wording and rejects an unchecked declaration before recording a signature',async()=>{
 fixture.request.status='sent';fixture.request.expires_at=new Date(Date.now()+86400000);fixture.request.fields=[{recipient_id:1,page:0,x:.1,y:.6,width:.3,height:.08,type:'signature'}];
 const signature='data:image/png;base64,'+(await sharp({create:{width:80,height:20,channels:4,background:'#111'}}).png().toBuffer()).toString('base64');
 const rejected=await call('POST /api/public/sign-documents/:token/sign',{...acceptedConsents,signature,consent:true,acknowledgements:{...acceptedConsents.acknowledgements,declaration:false}},{token:fixture.recipients[0].token});
 expect(rejected.status).toBe(400);expect(fixture.recipients[0].signed_at).toBeFalsy();expect(fixture.documents).toHaveLength(0);
 const accepted=await call('POST /api/public/sign-documents/:token/sign',{...acceptedConsents,signature,consent:true},{token:fixture.recipients[0].token});
 expect(accepted.status).toBe(200);expect(fixture.recipients[0].consent_snapshot.statements).toHaveLength(3);expect(fixture.recipients[0].consent_snapshot.statements.every(s=>s.accepted===true)).toBe(true);
});
