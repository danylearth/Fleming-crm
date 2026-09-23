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
const dir=mkdtempSync(path.join(tmpdir(),'fleming-marie-')),port=Number(process.env.TEST_PORT||3327);
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
 const png='data:image/png;base64,'+(await sharp({create:{width:200,height:60,channels:4,background:'#222222'}}).png().toBuffer()).toString('base64');
 const landlord=await one("INSERT INTO landlords(name,email,phone,address,landlord_type,entity_type,company_number) VALUES('Example Company Ltd','director@example.test','07700900001','1 Owner Road','external','company','12345678') RETURNING id");
 await db.query("INSERT INTO landlord_bank_details(landlord_id,account_name,sort_code,account_number,bank_name,approved_at,approved_by) VALUES($1,'Example Company Ltd','12-34-56','12345678','Test Bank',NOW(),$2)",[landlord.id,users.admin]);
 let last;
 for(const service of ['let_only','rent_collection','full_management']){
  const p=await one("INSERT INTO properties(address,postcode,landlord_id,status,service_type,rent_amount) VALUES($1,'WV10 8EU',$2,'to_let',$3,900) RETURNING id",['21 QA '+service,landlord.id,service]);
  const e=await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,phone_1,status,linked_property_id) VALUES('QA','Applicant','applicant@example.test','07700900222','new',$1) RETURNING id",[p.id]);
  await test(service+' blocks public marketing and onboarding without a signed service contract',async()=>{assert(!(await request('/api/public/properties')).data.some(x=>x.id===p.id));const result=await api(`/api/tenant-enquiries/${e.id}`,{status:'onboarding'},'PUT');assert.equal(result.status,409,JSON.stringify(result));});
  let a;
  await test(service+' creates original populated company contract and preview',async()=>{
   const result=await api(`/api/properties/${p.id}/service-agreements`,{setup_fee:50,monthly_fee:10,signatory_name:'Jane Director'});assert.equal(result.status,201,JSON.stringify(result));a=result.data;
   assert.equal((await request('/api/public/service-agreements/'+a.token)).status,404);
   const doc=await fetch(`http://127.0.0.1:${port}/api/service-agreements/${a.id}/pdf`,{headers:{Authorization:'Bearer '+tokens.admin}});assert.equal(doc.status,200);const file=path.join(dir,service+'.pdf');writeFileSync(file,Buffer.from(await doc.arrayBuffer()));const text=spawnSync('pdftotext',[file,'-'],{encoding:'utf8'}).stdout;assert(text.includes('Example Company Ltd'));assert(text.includes('Jane Director'));assert(!text.includes('#####'));assert(text.includes('12345678'));
   const mail=await api(`/api/service-agreements/${a.id}/preview`,{});assert.equal(mail.status,200);assert(!/LANDLORD NAME|PROPERTY ADDRESS/.test(mail.data.html));assert(mail.data.html.includes(a.token));
  });
  await test(service+' send and draft signing preview do not save a signature',async()=>{const sent=await api(`/api/service-agreements/${a.id}/send`,{});assert.equal(sent.status,200,JSON.stringify(sent));assert(sent.data.simulated);const before=await one('SELECT * FROM landlord_service_agreements WHERE id=$1',[a.id]);
   const body={signature:png,signer_name:'Jane Director',bank_details:{account_name:'Example Company Ltd',sort_code:'11-22-33',account_number:'87654321',bank_name:'Other Bank'}};
   const preview=await fetch(`http://127.0.0.1:${port}/api/public/service-agreements/${a.token}/preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(preview.status,200,preview.status===200?undefined:await preview.text());writeFileSync(path.join(dir,service+'-preview.pdf'),Buffer.from(await preview.arrayBuffer()));assert.deepEqual(await one('SELECT * FROM landlord_service_agreements WHERE id=$1',[a.id]),before);
  });
  await test(service+' signs once, links a single PDF to both records, carries bank details into APT, unlocks marketing',async()=>{
   const body={signature:png,signer_name:'Jane Director',bank_details:{account_name:'Example Company Ltd',sort_code:'11-22-33',account_number:'87654321',bank_name:'Other Bank'},accepted_terms:true,bank_approved:true,start_immediately:true};
   const result=await request(`/api/public/service-agreements/${a.token}/sign`,{method:'POST',body});assert.equal(result.status,200,JSON.stringify(result));assert.equal((await request(`/api/public/service-agreements/${a.token}/sign`,{method:'POST',body})).status,409);
   const docs=(await db.query("SELECT * FROM documents WHERE doc_type='service_agreement' AND filename=(SELECT signed_filename FROM landlord_service_agreements WHERE id=$1)",[a.id])).rows;assert.equal(docs.length,2);assert.equal(docs[0].filename,docs[1].filename);
   const ctx=await api(`/api/tenant-enquiries/${e.id}/client-agreement-details`);assert.equal(ctx.data.bank.account_number,'87654321');assert(ctx.data.serviceAgreementSigned);
   assert((await request('/api/public/properties')).data.some(x=>x.id===p.id));
   assert.equal((await api(`/api/tenant-enquiries/${e.id}`,{status:'onboarding'},'PUT')).status,200);
  });
  last={propertyId:p.id,enquiryId:e.id,agreementId:a.id,serviceToken:a.token};
 }
 await test('tenant list includes landlord portfolio classification',async()=>{await db.query("INSERT INTO tenants(first_name_1,last_name_1,name,property_id,status) VALUES('QA','Client Tenant','QA Client Tenant',$1,'active')",[last.propertyId]);const response=await api('/api/tenants');assert(response.data.some(t=>t.name==='QA Client Tenant'&&t.landlord_type==='external'));});
 if(process.env.QA_MANIFEST)writeFileSync(process.env.QA_MANIFEST,JSON.stringify({dir,port,databaseUrl:url.toString(),token:tokens.admin,landlordId:landlord.id,...last},null,2),{mode:0o600});
 console.log(`${passed} service feedback checks passed. Logs: ${dir}`);
}catch(e){console.error(e);process.exitCode=1;}finally{server.kill('SIGTERM');await db.end();}
