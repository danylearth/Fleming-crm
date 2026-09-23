import PizZip from 'pizzip';
import {readFileSync} from 'node:fs';
import {generateTenancyAgreementPdf} from '../dist/tenancy-agreement-pdf.js';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,openSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
const url=new URL(process.env.TEST_DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/fleming_crm_test'));
const db=new pg.Pool({connectionString:url.toString()});assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
const dir=mkdtempSync(path.join(tmpdir(),'fleming-marie-')),port=Number(process.env.TEST_PORT||3326);
const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',DATABASE_URL:url.toString(),JWT_SECRET:'afternoon-local-only',UPLOADS_PATH:dir,PORT:String(port),BASE_URL:`http://127.0.0.1:${port}`,LOG_LEVEL:'error',ALLOW_SIMULATED_MESSAGES:'true'};
const migration=spawnSync(process.execPath,['dist/migrate.js'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
const server=spawn(process.execPath,['dist/index-pg.js'],{env,stdio:['ignore',openSync(path.join(dir,'server.log'),'w'),openSync(path.join(dir,'errors.log'),'w')]});
const one=async(t,a=[])=>(await db.query(t,a)).rows[0];
async function request(route,{method='GET',body,token}={}){const multipart=body instanceof FormData;const r=await fetch(`http://127.0.0.1:${port}`+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body&&!multipart?{'Content-Type':'application/json'}:{})},body:body?(multipart?body:JSON.stringify(body)):undefined});return {status:r.status,data:await r.json()};}
let passed=0;const test=async(name,fn)=>{await fn();console.log('PASS '+name);passed++;};
try{
 for(let i=0;i<100;i++){try{if((await request('/api/health')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const tokens={},users={};for(const role of ['admin','manager','staff','viewer']){const u=await one('INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4) RETURNING id',['QA '+role,role+'@example.test',await bcrypt.hash('Test-password-123!',4),role]);users[role]=u.id;const login=await request('/api/auth/login',{method:'POST',body:{email:role+'@example.test',password:'Test-password-123!'}});assert.equal(login.status,200);tokens[role]=login.data.token;}
 const api=(route,body,method=body?'POST':'GET',role='admin')=>request(route,{method,body,token:tokens[role]});
 const l=await one("INSERT INTO landlords(name,email,phone,address,landlord_type) VALUES('QA Landlord','landlord@example.test','07700900111','2 Owner Road','external') RETURNING id");
 const p=await one("INSERT INTO properties(address,postcode,landlord_id,status,service_type,rent_amount,has_gas) VALUES('12 QA Street','WV1 1AA',$1,'to_let','let_only',750,0) RETURNING id",[l.id]);
 await db.query("INSERT INTO landlord_service_agreements(property_id,landlord_id,service_type,setup_fee,monthly_fee,payment_route,status,token,details,bank_details,filename,signed_at) VALUES($1,$2,'let_only',50,0,'landlord','signed','marie-service-fixture','{}','{}','fixture.pdf',NOW())",[p.id,l.id]);
 const e=await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,phone_1,status,linked_property_id,follow_up_date,holding_deposit_requested,holding_deposit_received,holding_deposit_amount,holding_deposit_received_amount,application_form_sent,application_form_completed,application_review_status,credit_check_completed,monthly_rent_agreed,security_deposit_amount) VALUES('Alex','Applicant','applicant@example.test','07700900222','onboarding',$1,CURRENT_DATE+2,1,1,173,173,1,1,'approved',1,750,750) RETURNING id",[p.id]);
 await db.query("INSERT INTO landlord_bank_details(landlord_id,account_name,sort_code,account_number,approved_at) VALUES($1,'QA Landlord','12-34-56','12345678',NOW())",[l.id]);
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=';
 const input={enquiryId:e.id,agreementType:'client',serviceType:'let_only',agreementDate:new Date('2026-09-23T12:00Z'),tenancyStartDate:new Date('2026-10-05T12:00Z'),rent:750,deposit:750,holdingDeposit:173,propertyAddress:'12 QA Street, WV1 1AA',hasGas:false,landlord:{name:'QA Landlord',address:'2 Owner Road',email:'landlord@example.test',phone:'07700900111'},tenants:[{name:'Alex Applicant',email:'applicant@example.test',address:'3 Old Street',phone:'07700900222'}],permittedOccupiers:'None',sharedFacilities:'None',parking:'Private driveway',paymentReference:'12 WV11AA - APPLICANT',bankDetails:{sortCode:'12-34-56',accountNumber:'12345678',accountName:'QA Landlord',bankName:'Example Bank'},paymentRoute:'landlord',complianceDocuments:['EPC','EICR']};
 const pdf=await generateTenancyAgreementPdf(input);writeFileSync(path.join(dir,'agreement.pdf'),pdf);
 const a=await one("INSERT INTO tenancy_agreements(enquiry_id,property_id,agreement_type,filename,original_name,tenant_token,tenant_slug,landlord_token,landlord_slug,requires_landlord_signature,agreement_details) VALUES($1,$2,'client','agreement.pdf','QA agreement.pdf','qa-tenant-token','apt-qa-tenant','qa-landlord-token','apt-qa-landlord',1,$3) RETURNING id",[e.id,p.id,JSON.stringify({clientLandlord:{landlordName:'QA Landlord',landlordEmail:'landlord@example.test'},tenancyStartDate:'2026-10-05'})]);
 await test('available properties are returned',async()=>{assert((await request('/api/public/properties')).data.some(x=>x.id===p.id));});
 await test('landlord preview includes HTML and actual recipient',async()=>{const result=await api(`/api/tenant-enquiries/${e.id}/landlord-agreement-preview`,{});assert.equal(result.status,200,JSON.stringify(result));assert(result.data.html.includes('QA Landlord'));assert.equal(result.data.to,'landlord@example.test');});
 await test('landlord history includes linked agreement messages without tenant mail or duplicate logs',async()=>{
  for(const [to,template] of [['landlord@example.test','landlord_tenancy_agreement'],['landlord@example.test','completed_tenancy_agreement'],['applicant@example.test','completed_tenancy_agreement']])await db.query("INSERT INTO email_messages(entity_type,entity_id,to_email,template,subject,body_html,status) VALUES('tenant_enquiry',$1,$2,$3,'QA','<p>QA</p>','sent')",[e.id,to,template]);
  const result=await api(`/api/email-history/landlord/${l.id}`);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.length,2);assert(result.data.every(x=>x.to_email==='landlord@example.test'));
 });
 await test('agreement date matches commencement and rent increase paragraph stays together',async()=>{
  const text=spawnSync('pdftotext',['-layout',path.join(dir,'agreement.pdf'),'-'],{encoding:'utf8'});assert.equal(text.status,0);assert(text.stdout.includes('5th October 2026'));assert(!text.stdout.includes('23rd September 2026'));
  for(const page of text.stdout.split('\f'))if(page.includes('If the Landlord wishes to propose'))assert(page.includes('market rate.'));
 });
 const publicPdf=async(slug,body)=>{const response=await fetch(`http://127.0.0.1:${port}/api/public/tenancy-agreements/${slug}/preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:Buffer.from(await response.arrayBuffer())};};
 await test('both client templates preserve clauses on one page and contain no blank pages',async()=>{
  const clean=text=>text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
  for(const service of ['let_only','rent_collection']){
   const bytes=await generateTenancyAgreementPdf({...input,serviceType:service}),file=path.join(dir,service+'.pdf');writeFileSync(file,bytes);
   const text=spawnSync('pdftotext',[file,'-'],{encoding:'utf8'}).stdout,pages=text.split('\f').slice(0,-1);assert(pages.every(p=>p.trim().length>50));
   const xml=new PizZip(readFileSync('src/agreement-assets/'+(service==='let_only'?'client-let-only-aug26.docx':'client-rent-collection-aug26.docx'))).file('word/document.xml').asText();
   const clauses=[...xml.matchAll(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)].map(m=>m[0].replace(/<[^>]+>/g,'')).filter(t=>/^[•\s]*\d+\.\d+/.test(t)&&!t.includes('{{'));
   for(const clause of clauses)assert(pages.some(page=>clean(page).includes(clean(clause))),`Split or missing clause: ${service} ${clause.slice(0,60)}`);
  }
 });
 await test('draft preview enforces landlord-first and does not save a signature',async()=>{
  assert.equal((await publicPdf('apt-qa-tenant',{signature:png})).status,409);
  const before=await one('SELECT * FROM tenancy_agreements WHERE id=$1',[a.id]);const preview=await publicPdf('apt-qa-landlord',{signature:png});assert.equal(preview.status,200,preview.data.toString());writeFileSync(path.join(dir,'landlord-preview.pdf'),preview.data);
  assert.deepEqual(await one('SELECT * FROM tenancy_agreements WHERE id=$1',[a.id]),before);
  const text=spawnSync('pdftotext',[path.join(dir,'landlord-preview.pdf'),'-'],{encoding:'utf8'}).stdout;assert((text.match(/Signed on:/g)||[]).length>=2);
 });
 await test('landlord signing unlocks tenant preview; office receives every signing link',async()=>{
  const sign=await request('/api/public/tenancy-agreements/apt-qa-landlord/sign',{method:'POST',body:{signature:png,signature_name:'QA Landlord',accepted_terms:true,accepted_binding:true,accepted_payment_schedule:true}});assert.equal(sign.status,200,JSON.stringify(sign));
  const preview=await publicPdf('apt-qa-tenant',{signature:png});assert.equal(preview.status,200,preview.data.toString());writeFileSync(path.join(dir,'tenant-preview.pdf'),preview.data);assert.equal((await one('SELECT tenant_signed_at FROM tenancy_agreements WHERE id=$1',[a.id])).tenant_signed_at,null);
  const detail=(await api(`/api/tenant-enquiries/${e.id}/tenancy-agreement`)).data;assert.equal(detail.tenant_slug,'apt-qa-tenant');assert.equal(detail.landlord_slug,'apt-qa-landlord');assert(detail.landlord_signed_at);
 });
 await test('receipt confirmation requires supplied valid date',async()=>{
  await db.query('UPDATE tenant_enquiries SET balance_payment_requested=1,balance_due_amount=1327 WHERE id=$1',[e.id]);
  for(const body of [{},{received_date:'2026-02-31'},{received_date:'2099-01-01'}])assert.equal((await api(`/api/tenant-enquiries/${e.id}/confirm-balance`,body)).status,400);
  assert.equal((await one('SELECT balance_payment_received FROM tenant_enquiries WHERE id=$1',[e.id])).balance_payment_received,0);
 });
 await test('correcting an assumed receipt clears paid/opening amounts and overdue email has property address',async()=>{
  const t=await one("INSERT INTO tenants(first_name_1,last_name_1,name,property_id,monthly_rent,status) VALUES('QA','Tenant','QA Tenant',$1,620,'active') RETURNING id",[p.id]);
  const rent=await one("INSERT INTO rent_payments(tenant_id,property_id,due_date,amount_due,amount_paid,opening_balance_amount,status) VALUES($1,$2,CURRENT_DATE-2,620,620,620,'paid') RETURNING id",[t.id,p.id]);
  assert.equal((await api('/api/rent-payments/'+rent.id,{amount_paid:0,status:'pending',payment_date:null,notes:'Office confirmed unpaid'},'PUT')).status,200);
  const saved=(await api('/api/rent-payments/'+rent.id)).data;assert.equal(Number(saved.amount_paid),0);assert.equal(Number(saved.opening_balance_amount),0);assert.equal(saved.status,'pending');
  const templates=(await api(`/api/tenants/${t.id}/message-templates`)).data.templates;assert(templates.find(x=>x.id===`rent-${rent.id}`).html.includes('12 QA Street, WV1 1AA'));
 });
 if(process.env.QA_MANIFEST)writeFileSync(process.env.QA_MANIFEST,JSON.stringify({dir,port,databaseUrl:url.toString(),token:tokens.admin,enquiryId:e.id,landlordId:l.id,propertyId:p.id,agreementId:a.id},null,2),{mode:0o600});
 console.log(`${passed} Marie feedback checks passed. Logs: ${dir}`);
}catch(e){console.error(e);process.exitCode=1;}finally{server.kill('SIGTERM');await db.end();}
