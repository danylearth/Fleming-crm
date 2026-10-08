// Real HTTP + PostgreSQL rehearsal. Requires only an empty, local test database.
// Provider credentials are deliberately excluded from the child environment.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, openSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import {createHash,randomBytes} from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to an EMPTY local PostgreSQL database with a name starting fleming_crm_test');
const url = new URL(databaseUrl);
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.startsWith('/fleming_crm_test'), 'Integration tests only run on a dedicated local test database');
const db = new pg.Pool({ connectionString: databaseUrl });
const count = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
assert.equal(count.rows[0].n, 0, 'Test database must be empty; refusing to modify existing data');
const dir = mkdtempSync(path.join(tmpdir(), 'fleming-integration-'));
const port = Number(process.env.TEST_PORT || 3309);
const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', DATABASE_URL: databaseUrl, JWT_SECRET: 'integration-only-do-not-deploy-this-secret', PORTAL_CREDENTIALS_KEY: Buffer.alloc(32,1).toString('base64'), UPLOADS_PATH: dir, PORT: String(port), LOG_LEVEL: 'error', ...(process.env.LIBREOFFICE_PATH ? {LIBREOFFICE_PATH: process.env.LIBREOFFICE_PATH} : {}) };
const migration = spawnSync(process.execPath, ['dist/migrate.js'], { env, encoding: 'utf8' });
assert.equal(migration.status, 0, migration.stderr);
const secondMigration = spawnSync(process.execPath, ['dist/migrate.js'], { env, encoding: 'utf8' });
assert.equal(secondMigration.status, 0, secondMigration.stderr);
const log = openSync(path.join(dir, 'server.log'), 'w');
env.RESEND_API_KEY='re_isolated_test';
const server = spawn(process.execPath, ['--require','./tests/isolated-email-transport.cjs','dist/index-pg.js'], { env, stdio: ['ignore', log, log] });
const base = `http://127.0.0.1:${port}`;
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function request(route, { method = 'GET', body, token, ...extra } = {}) {
  const res = await fetch(base + route, { method, headers: { 'X-Forwarded-For':`192.0.2.${passed+1}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, ...extra });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
async function ok(route, options) { const r = await request(route, options); assert.equal(r.status, 200, `${route}: ${JSON.stringify(r.data)}`); return r.data; }
const sql = async (text, args = []) => (await db.query(text, args)).rows;
const one = async (text, args = []) => (await sql(text, args))[0];
try {
  for (let i = 0; i < 100; i++) { try { if ((await request('/api/health')).status === 200) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  await test('fresh schema and repeat migration boot a healthy API', async () => assert.equal((await ok('/api/health')).status, 'ok'));
  const password = 'Local-test-password-386!';
  for (const role of ['admin', 'staff', 'viewer']) await sql('INSERT INTO users(email,password,name,role) VALUES($1,$2,$3,$4)', [`${role}@example.test`, await bcrypt.hash(password, 4), `Test ${role}`, role]);
  const auth = {};
  for (const role of ['admin', 'staff', 'viewer']) {
    const user=await one('SELECT id FROM users WHERE email=$1',[role+'@example.test']);
    const challenge=await ok('/api/auth/login',{method:'POST',body:{email:role+'@example.test',password}});
    assert.equal(challenge.requiresTwoFactor,true);
    const device=randomBytes(32).toString('hex'),sha=value=>createHash('sha256').update(value).digest('hex');
    await sql("INSERT INTO trusted_login_devices(token_hash,user_id,user_agent_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')",[sha(device),user.id,sha('fresh-onboarding-test')]);
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'fresh-onboarding-test',Cookie:'fleming_device_'+user.id+'='+device},body:JSON.stringify({email:role+'@example.test',password})});
    assert.equal(login.status,200);auth[role]=(await login.json()).token;assert(auth[role]);
  }
  await test('anonymous requests and viewer writes are rejected; staff cannot administer users', async () => {
    assert.equal((await request('/api/tenants')).status, 401);
    assert.equal((await request('/api/landlords', { method: 'POST', token: auth.viewer, body: { name: 'Forbidden' } })).status, 403);
    assert.equal((await request('/api/users', { token: auth.staff })).status, 403);
    assert.equal((await request('/api/tenants', { token: auth.viewer })).status, 200);
  });
  await test('bad JSON is rejected as a client error, and API responses cannot be cached', async () => {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(r.status, 400);
    assert.equal((await request('/api/tenants', { token: auth.admin })).headers.get('cache-control'), 'no-store');
  });
  const landlord = await one("INSERT INTO landlords(name,landlord_type) VALUES('Test Fleming','internal') RETURNING id");
  const property = await one("INSERT INTO properties(address,postcode,landlord_id,has_gas,rent_amount,epc_expiry_date,eicr_expiry_date) VALUES('1 Test Street','WV1 1AA',$1,0,1000,'2030-01-01','2030-01-01') RETURNING id", [landlord.id]);
  const sample = await PDFDocument.create(); sample.addPage(); const pdf = Buffer.from(await sample.save());
  writeFileSync(path.join(dir, 'sample.pdf'), pdf);
  for (const type of ['EPC', 'EICR']) await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('property',$1,$2,'sample.pdf',$3,'application/pdf','approved')", [property.id, type, `${type}.pdf`]);

  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());
  const png='data:image/png;base64,'+(await sharp({create:{width:200,height:60,channels:4,background:'#222222'}}).png().toBuffer()).toString('base64');
  const e=await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,phone_1,linked_property_id,holding_deposit_received,application_form_completed,application_review_status,credit_check_completed,monthly_rent_agreed,security_deposit_amount,holding_deposit_amount,current_address_1,guarantor_required) VALUES('Sole','Applicant','sole@example.test','07700900001',$1,1,1,'approved',1,1000,1000,200,'Previous Example Address',FALSE) RETURNING id",[property.id]);
  await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('tenant_enquiry',$1,'Credit Check Report','sample.pdf','Sole Credit.pdf','application/pdf','approved')",[e.id]);
  let agreement;
  await test('fresh sole APT issues one applicant link and signs one completed PDF',async()=>{
    agreement=await ok('/api/tenant-enquiries/'+e.id+'/tenancy-agreement',{method:'POST',token:auth.staff,body:{tenancy_start_date:today,rent:1000,deposit:1000,permitted_occupiers:'None',shared_facilities:'None',parking:'None',send_email:false,send_sms:false}});
    assert(!agreement.joint_tenant_url);
    const token=new URL(agreement.tenant_url).pathname.slice(1);
    await ok('/api/public/tenancy-agreements/'+token+'/sign',{method:'POST',body:{signature_name:'Sole Applicant',signature:png,accepted_terms:true,accepted_binding:true,accepted_payment_schedule:true}});
    const row=await one('SELECT * FROM tenancy_agreements WHERE id=$1',[agreement.agreement_id]);assert.equal(row.status,'completed');
    const signed=await PDFDocument.load(readFileSync(path.join(dir,row.signed_filename)));assert(signed.getPageCount()>4);
    const alerts=await ok('/api/notifications',{token:auth.staff});assert(alerts.items.some(n=>n.href==='/enquiries/'+e.id&&n.category==='tenant'&&n.workflow==='internal'&&n.title.includes('APT completed')));
  });
  await test('sole balance, handover and conversion create one tenant with agreement history',async()=>{
    const root='/api/tenant-enquiries/'+e.id;
    await ok(root+'/request-balance',{method:'POST',token:auth.staff,body:{follow_up_date:today,send_email:true,send_sms:false}});
    await ok(root+'/confirm-balance',{method:'POST',token:auth.staff,body:{received_date:today,received_amount:1800}});
    await ok(root+'/schedule-handover',{method:'POST',token:auth.staff,body:{handover_date:today,handover_time:'10:30',assigned_to:'Test staff'}});
    const result=await ok(root+'/convert',{method:'POST',token:auth.staff,body:{property_id:property.id,tenancy_start_date:today}});
    const tenants=await sql('SELECT * FROM tenants WHERE source_enquiry_id=$1',[e.id]);assert.equal(tenants.length,1);assert(!tenants[0].linked_tenant_id);assert.equal(result.tenant_id,tenants[0].id);
    assert(await one("SELECT id FROM documents WHERE entity_type='tenant' AND entity_id=$1 AND doc_type='Signed Tenancy Agreement'",[result.tenant_id]));
    assert(!(await ok('/api/notifications',{token:auth.staff})).items.some(n=>n.href==='/enquiries/'+e.id));
  });
  await test('landlord registration validates addresses and company owners; token protects attached documents',async()=>{
    const base={registration_type:'Limited Company',firstName:'Owner',surname:'Test',email:'intake@example.test',phone:'07700900111',address:'10 Test Road',city:'Wolverhampton',postcode:'WV1 1AA',propertyAddress:'20 Test Road',propertyCity:'Wolverhampton',propertyPostcode:'WV1 1BB',company_name:'Example Ltd',company_number:'12345678',company_address:'30 Test Road',companyCity:'Wolverhampton',companyPostcode:'WV1 1CC'};
    assert.equal((await request('/api/public/landlord-enquiries',{method:'POST',body:base})).status,400);
    const created=await request('/api/public/landlord-enquiries',{method:'POST',body:{...base,beneficial_owners:'Owner Test 100%'}});assert.equal(created.status,201,JSON.stringify(created.data));
    const company=await one('SELECT entity_type,company_number,name,address FROM landlords_bdm WHERE id=$1',[created.data.enquiry_id]);assert.equal(company.entity_type,'company');assert.equal(company.company_number,'12345678');assert.equal(company.name,'Example Ltd');assert.match(company.address,/30 Test Road/);
    const url=`/api/public/landlord-enquiries/${created.data.enquiry_id}/documents`;
    const body=new FormData();body.append('documents',new Blob([pdf],{type:'application/pdf'}),'Ownership.pdf');body.append('doc_type','Proof of Ownership');
    assert.equal((await fetch(`http://127.0.0.1:${port}`+url,{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${passed+1}`},body})).status,403);
    const response=await fetch(`http://127.0.0.1:${port}`+url+'?token='+created.data.upload_token,{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${passed+1}`},body});assert.equal(response.status,200,await response.text());
    const docs=await ok(`/api/documents/landlord_bdm/${created.data.enquiry_id}`,{token:auth.staff});assert(docs.some(d=>d.doc_type==='Proof of Ownership'&&d.review_status==='pending'));
    assert.equal((await one('SELECT intake_data FROM landlords_bdm WHERE id=$1',[created.data.enquiry_id])).intake_data.beneficial_owners,'Owner Test 100%');
  });

  console.log(passed+' fresh sole onboarding and new landlord intake scenarios passed; email transport intercepted locally.');
} catch(error) { console.error(error); console.error('Server log:',path.join(dir,'server.log')); process.exitCode=1; }
finally { server.kill('SIGTERM'); await once(server,'exit').catch(()=>{}); await db.end(); }
