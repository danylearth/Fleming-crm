// Real HTTP + PostgreSQL rehearsal. Requires only an empty, local test database.
// Provider credentials are deliberately excluded from the child environment.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import pg from 'pg';
import bcrypt from 'bcryptjs';
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
const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', DATABASE_URL: databaseUrl, JWT_SECRET: 'integration-only-do-not-deploy-this-secret', UPLOADS_PATH: dir, PORT: String(port), LOG_LEVEL: 'error', ...(process.env.LIBREOFFICE_PATH ? {LIBREOFFICE_PATH: process.env.LIBREOFFICE_PATH} : {}) };
const migration = spawnSync(process.execPath, ['dist/migrate.js'], { env, encoding: 'utf8' });
assert.equal(migration.status, 0, migration.stderr);
const secondMigration = spawnSync(process.execPath, ['dist/migrate.js'], { env, encoding: 'utf8' });
assert.equal(secondMigration.status, 0, secondMigration.stderr);
const log = openSync(path.join(dir, 'server.log'), 'w');
const server = spawn(process.execPath, ['dist/index-pg.js'], { env, stdio: ['ignore', log, log] });
const base = `http://127.0.0.1:${port}`;
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function request(route, { method = 'GET', body, token, ...extra } = {}) {
  const res = await fetch(base + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, ...extra });
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
  for (const role of ['admin', 'staff', 'viewer']) auth[role] = (await ok('/api/auth/login', { method: 'POST', body: { email: `${role}@example.test`, password } })).token;
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
  const ta = new URL(agreement.tenant_url).pathname.slice(1), tb = new URL(agreement.joint_tenant_url).pathname.slice(1);
  await test('handover preview validates dates without sending messages or scheduling tasks', async () => {
    const preview = await ok(`/api/tenant-enquiries/${a}/schedule-handover/email-preview`,{method:'POST',token:auth.staff,body:{handover_date:today,handover_time:'10:30',assigned_to:'Test staff'}});
    assert.match(preview.body_html, /10:30/); assert.equal((await one('SELECT count(*)::int AS n FROM email_messages')).n,0);
  });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=';
  await test('signature requires affirmative consent and a decodable image',async()=>{
    assert.equal((await request(`/api/public/tenancy-agreements/${ta}/sign`,{method:'POST',body:{signature_name:'Alex Test',signature:png}})).status,400);
    assert.equal((await request(`/api/public/tenancy-agreements/${ta}/sign`,{method:'POST',body:{signature_name:'Alex Test',signature:'data:image/png;base64,aGVsbG8=',accepted_terms:true}})).status,400);
    assert.equal((await one('SELECT tenant_signed_at FROM tenancy_agreements WHERE id=$1',[agreement.agreement_id])).tenant_signed_at,null);
  });
  await test('two concurrent signers finalise one PDF and advance both enquiry records', async()=>{
    const results = await Promise.all([request(`/api/public/tenancy-agreements/${ta}/sign`,{method:'POST',body:{signature_name:'Alex Łukasz Test',signature:png,accepted_terms:true}}),request(`/api/public/tenancy-agreements/${tb}/sign`,{method:'POST',body:{signature_name:'Jamie Test',signature:png,accepted_terms:true}})]);
    results.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.data)));
    const row=await one('SELECT * FROM tenancy_agreements WHERE id=$1',[agreement.agreement_id]); assert.equal(row.status,'completed'); assert(row.signed_filename);
    const docs=await sql("SELECT * FROM documents WHERE doc_type='Signed Tenancy Agreement'"); assert.equal(docs.length,3); assert.equal(new Set(docs.map(x=>x.filename)).size,1);
    for(const x of await sql('SELECT onboarding_step FROM tenant_enquiries WHERE id=ANY($1::int[])',[[a,b]])) assert(x.onboarding_step>=7);
    const signedPdf=await PDFDocument.load(readFileSync(path.join(dir,row.signed_filename))); assert(signedPdf.getPageCount()>4);
  });
  await test('reopening a signed link reports its immutable completed state',async()=>{
    const r=await ok(`/api/public/tenancy-agreements/${ta}`);assert.equal(r.signer_signed,true);assert.deepEqual(r.outstanding_signers,[]);
    assert.equal((await request(`/api/public/tenancy-agreements/${ta}/sign`,{method:'POST',body:{signature_name:'Someone Else',signature:png,accepted_terms:true}})).status,409);
  });
  await test('balance request, receipt and handover advance both records',async()=>{
    await ok(`/api/tenant-enquiries/${b}/request-balance`,{method:'POST',token:auth.staff,body:{follow_up_date:today,send_email:false,send_sms:false}});
    await ok(`/api/tenant-enquiries/${b}/confirm-balance`,{method:'POST',token:auth.staff,body:{}});
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
  await test('financial totals count joint rent once and exclude historic collections',async()=>{
    await sql("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status) VALUES($1,$2,$3,1000,400,'partial'),($1,$2,'2020-01-01',1000,1000,'paid')",[property.id,tenantId,today]);
    const summary=await ok('/api/financial-summary',{token:auth.staff});assert.equal(Number(summary.monthly_rent),1000);assert.equal(Number(summary.collected),400);assert.equal(Number(summary.outstanding),600);assert.equal(summary.active_tenancies,1);
    const dashboard=await ok('/api/dashboard',{token:auth.staff});assert.equal(dashboard.stats.active_tenancies,1);
  });
  await test('maintenance link is prefilled, binds reports to the correct tenant, and accepts photos',async()=>{
    const link=await ok(`/api/tenants/${tenantId}/maintenance-report-link`,{method:'POST',token:auth.staff,body:{}});
    const token=new URL(link.url).pathname.slice(1);const prefill=await ok(`/api/public/maintenance-report/${token}`);assert.match(prefill.address,/1 Test Street/);
    const form=new FormData();form.set('title','Test repair');form.set('description','Test tap requires a repair.');form.set('category','other');form.set('priority','low');form.set('files',new Blob([Buffer.from(png.split(',')[1],'base64')],{type:'image/png'}),'test.png');
    const res=await fetch(base+`/api/public/maintenance-report/${token}`,{method:'POST',body:form});assert.equal(res.status,201,await res.text());
    const row=await one('SELECT * FROM maintenance ORDER BY id DESC LIMIT 1');assert.equal(row.tenant_id,tenantId);assert.equal(row.property_id,property.id);
  });
  await test('document categories include deposit certificate and prescribed information',async()=>{
    const types=await ok('/api/documents/types/tenant',{token:auth.staff});assert.match(JSON.stringify(types),/Tenant Deposit Certificate/);assert.match(JSON.stringify(types),/Tenant Deposit Prescribed Information/i);
  });
  console.log(`\n${passed} integration scenarios passed. Private artifacts: ${dir}`);
} catch(error) { console.error(error); console.error('Server log:',path.join(dir,'server.log')); process.exitCode=1; }
finally { server.kill('SIGTERM'); await once(server,'exit').catch(()=>{}); await db.end(); }
