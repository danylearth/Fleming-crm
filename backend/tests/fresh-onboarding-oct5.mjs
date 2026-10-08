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
  const applicants = [];
  for (const name of ['Alex', 'Jamie']) applicants.push(await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,phone_1,linked_property_id,is_joint_application,holding_deposit_received,application_form_completed,application_review_status,credit_check_completed,monthly_rent_agreed,security_deposit_amount,holding_deposit_amount,current_address_1) VALUES($1,'Test',$2,'07700900001',$3,1,1,1,'approved',1,1000,1000,200,'Previous Test Address') RETURNING id", [name, `${name.toLowerCase()}@example.test`, property.id]));
  const [a, b] = applicants.map(x => x.id);
  await sql('UPDATE tenant_enquiries SET guarantor_required=FALSE WHERE id=ANY($1::int[])',[[a,b]]);
  await sql('UPDATE tenant_enquiries SET joint_partner_id=$2 WHERE id=$1', [a,b]); await sql('UPDATE tenant_enquiries SET joint_partner_id=$2 WHERE id=$1', [b,a]);
  for (const id of [a,b]) await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('tenant_enquiry',$1,'Credit Check Report','sample.pdf',$2,'application/pdf','approved')", [id, `Credit for ${id}.pdf`]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const issueBody = { tenancy_start_date: today, rent: 1000, deposit: 1000, permitted_occupiers: 'None', shared_facilities: 'None', parking: 'None', send_email: false, send_sms: false };
  await test('joint agreements require both applicants to be reviewed', async () => {
    await sql("UPDATE tenant_enquiries SET application_review_status='pending' WHERE id=$1", [b]);
    assert.equal((await request(`/api/tenant-enquiries/${a}/tenancy-agreement`, { method:'POST', token:auth.staff, body:issueBody })).status,409);
    await sql("UPDATE tenant_enquiries SET application_review_status='approved' WHERE id=$1", [b]);
  });
  let agreement;
  await test('agreement issuance produces separate high-entropy links and a readable compliance pack', async () => {
    agreement = await ok(`/api/tenant-enquiries/${b}/tenancy-agreement`, { method:'POST', token:auth.staff, body:issueBody });
    assert.notEqual(agreement.tenant_url, agreement.joint_tenant_url);
    assert.match(agreement.tenant_url, /apt-test-a-[a-f0-9]{32}$/);
    const row = await one('SELECT filename FROM tenancy_agreements WHERE id=$1',[agreement.agreement_id]);
    const pack = await PDFDocument.load(readFileSync(path.join(dir,row.filename))); assert(pack.getPageCount() > 3);
  });
  await test('issued agreement previews reuse each applicant’s actual signing link',async()=>{
    for(const [id,url] of [[a,agreement.tenant_url],[b,agreement.joint_tenant_url]]){
      const preview=await ok(`/api/tenant-enquiries/${id}/tenancy-agreement/email-preview`,{method:'POST',token:auth.staff,body:{}});
      assert(preview.body_html.includes(url));assert(!preview.body_html.includes('[signing-link-created-on-issue]'));
    }
  });
  await test('bulk removal cannot bypass property contract retention or administrator access',async()=>{
    assert.equal((await request('/api/properties/bulk-delete',{method:'POST',token:auth.staff,body:{ids:[property.id]}})).status,403);
    assert.equal((await request('/api/properties/bulk-delete',{method:'POST',token:auth.admin,body:{ids:[property.id]}})).status,409);
    assert(await one('SELECT id FROM properties WHERE id=$1',[property.id]));
  });
  const ta = new URL(agreement.tenant_url).pathname.slice(1), tb = new URL(agreement.joint_tenant_url).pathname.slice(1);
  await test('handover preview validates dates without sending messages or scheduling tasks', async () => {
    const preview = await ok(`/api/tenant-enquiries/${a}/schedule-handover/email-preview`,{method:'POST',token:auth.staff,body:{handover_date:today,handover_time:'10:30',assigned_to:'Test staff'}});
    assert.match(preview.body_html, /10:30/); assert.equal((await one('SELECT count(*)::int AS n FROM email_messages')).n,0);
  });
  const png = 'data:image/png;base64,'+(await sharp({create:{width:200,height:60,channels:4,background:'#222222'}}).png().toBuffer()).toString('base64');
  await test('signature requires affirmative consent and a decodable image',async()=>{
    assert.equal((await request(`/api/public/tenancy-agreements/${ta}/sign`,{method:'POST',body:{signature_name:'Alex Test',signature:png}})).status,400);
    assert.equal((await request(`/api/public/tenancy-agreements/${ta}/sign`,{method:'POST',body:{signature_name:'Alex Test',signature:'data:image/png;base64,aGVsbG8=',accepted_terms:true,accepted_binding:true,accepted_payment_schedule:true}})).status,400);
    assert.equal((await one('SELECT tenant_signed_at FROM tenancy_agreements WHERE id=$1',[agreement.agreement_id])).tenant_signed_at,null);
  });
  await test('two concurrent signers finalise one PDF and advance both enquiry records', async()=>{
    const results = await Promise.all([request(`/api/public/tenancy-agreements/${ta}/sign`,{method:'POST',body:{signature_name:'Alex Łukasz Test',signature:png,accepted_terms:true,accepted_binding:true,accepted_payment_schedule:true}}),request(`/api/public/tenancy-agreements/${tb}/sign`,{method:'POST',body:{signature_name:'Jamie Test',signature:png,accepted_terms:true,accepted_binding:true,accepted_payment_schedule:true}})]);
    results.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.data)));
    const row=await one('SELECT * FROM tenancy_agreements WHERE id=$1',[agreement.agreement_id]); assert.equal(row.status,'completed'); assert(row.signed_filename);
    const docs=await sql("SELECT * FROM documents WHERE doc_type='Signed Tenancy Agreement'"); assert.equal(docs.length,3); assert.equal(new Set(docs.map(x=>x.filename)).size,1);
    for(const x of await sql('SELECT onboarding_step FROM tenant_enquiries WHERE id=ANY($1::int[])',[[a,b]])) assert(x.onboarding_step>=7);
    const signedPdf=await PDFDocument.load(readFileSync(path.join(dir,row.signed_filename))); assert(signedPdf.getPageCount()>4);
    const signedText=spawnSync('pdftotext',['-layout',path.join(dir,row.signed_filename),'-'],{encoding:'utf8'});assert.equal(signedText.status,0);assert.equal((signedText.stdout.match(/Dated Signed:/g)||[]).length,6,'Both tenants sign the main agreement; landlord and both tenants sign the addendum');
    const receipts=signedText.stdout.slice(0,signedText.stdout.lastIndexOf('Electronic Signature Certificate'));
    for(const name of ['Alex Łukasz Test','Jamie Test'])assert((receipts.split(name).length-1)>=3,'Both signers must appear against the applicable receipt acknowledgements');
    assert(!signedText.stdout.includes('The electronic signature certificate records'));
    const certificate=signedText.stdout.slice(signedText.stdout.lastIndexOf('Electronic Signature Certificate'));
    assert.match(certificate,/IP address:/);assert.match(certificate,/192\.0\.2\./);assert(!certificate.includes('Robert'));assert(!certificate.includes('Landlord'));
    assert(!signedText.stdout.includes('Gas Safety Certificate ('));
    const pipeline=await ok('/api/tenant-enquiries',{token:auth.staff});for(const id of [a,b])assert.equal(pipeline.find(e=>e.id===id).tenancy_agreement_status,'completed');
  });
  await test('reopening a signed link reports its immutable completed state',async()=>{
    const r=await ok(`/api/public/tenancy-agreements/${ta}`);assert.equal(r.signer_signed,true);assert.deepEqual(r.outstanding_signers,[]);
    assert.equal((await request(`/api/public/tenancy-agreements/${ta}/sign`,{method:'POST',body:{signature_name:'Someone Else',signature:png,accepted_terms:true,accepted_binding:true,accepted_payment_schedule:true}})).status,409);
  });
  await test('balance request, receipt and handover advance both records',async()=>{
    await ok(`/api/tenant-enquiries/${b}/request-balance`,{method:'POST',token:auth.staff,body:{follow_up_date:today,send_email:true,send_sms:false}});
    await ok(`/api/tenant-enquiries/${b}/confirm-balance`,{method:'POST',token:auth.staff,body:{received_date:today,received_amount:1800}});
    await ok(`/api/tenant-enquiries/${b}/schedule-handover`,{method:'POST',token:auth.staff,body:{handover_date:today,handover_time:'10:30',assigned_to:'Test staff'}});
    for(const x of await sql('SELECT balance_payment_received,handover_date FROM tenant_enquiries WHERE id=ANY($1::int[])',[[a,b]])){assert.equal(x.balance_payment_received,1);assert(x.handover_date);}
  });
  await test('rescheduling handover updates one calendar task and rejects invalid dates',async()=>{
    await ok(`/api/tenant-enquiries/${a}/schedule-handover`,{method:'POST',token:auth.staff,body:{handover_date:today,handover_time:'11:45',assigned_to:'Test staff'}});
    assert.equal((await one("SELECT count(*)::int AS n FROM tasks WHERE task_type='handover'")).n,1);
    assert.equal((await request(`/api/tenant-enquiries/${a}/schedule-handover`,{method:'POST',token:auth.staff,body:{handover_date:'2026-02-31',handover_time:'25:90',assigned_to:'Test staff'}})).status,400);
  });
  await test('conversion cannot bypass the joint applicant credit check',async()=>{
    await sql('UPDATE tenant_enquiries SET credit_check_completed=0 WHERE id=$1',[a]);
    assert.equal((await request(`/api/tenant-enquiries/${b}/convert`,{method:'POST',token:auth.staff,body:{property_id:property.id,tenancy_start_date:today}})).status,409);
    assert.equal((await one('SELECT count(*)::int AS n FROM tenants')).n,0);
    await sql('UPDATE tenant_enquiries SET credit_check_completed=1 WHERE id=$1',[a]);
  });
  let tenantId;
  await test('concurrent conversion from either applicant creates exactly two linked tenants',async()=>{
    const results=await Promise.all([a,b].map(id=>request(`/api/tenant-enquiries/${id}/convert`,{method:'POST',token:auth.staff,body:{property_id:property.id,tenancy_start_date:today}})));
    assert.equal(results.filter(r=>r.status===200).length,1,JSON.stringify(results));
    const tenants=await sql('SELECT * FROM tenants ORDER BY id');assert.equal(tenants.length,2);tenantId=tenants[0].id;
    assert.equal(tenants[0].linked_tenant_id,tenants[1].id);assert.equal(tenants[1].linked_tenant_id,tenants[0].id);
    for(const t of tenants){const docs=await sql("SELECT original_name FROM documents WHERE entity_type='tenant' AND entity_id=$1 AND doc_type='Credit Check Report'",[t.id]);assert.equal(docs.length,1);assert.equal(docs[0].original_name,`Credit for ${t.source_enquiry_id}.pdf`);}
  });
  console.log(passed+' fresh joint onboarding/signing scenarios passed; email transport intercepted locally.');
} catch(error) { console.error(error); console.error('Server log:',path.join(dir,'server.log')); process.exitCode=1; }
finally { server.kill('SIGTERM'); await once(server,'exit').catch(()=>{}); await db.end(); }
