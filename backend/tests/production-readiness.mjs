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
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=';
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
    const signedText=spawnSync('pdftotext',[path.join(dir,row.signed_filename),'-'],{encoding:'utf8'});assert.equal(signedText.status,0);assert((signedText.stdout.match(/Signed on:/g)||[]).length>=5,'Both tenants and landlord must sign inside the addendum; tenant signatures also appear in the main agreement');
  });
  await test('reopening a signed link reports its immutable completed state',async()=>{
    const r=await ok(`/api/public/tenancy-agreements/${ta}`);assert.equal(r.signer_signed,true);assert.deepEqual(r.outstanding_signers,[]);
    assert.equal((await request(`/api/public/tenancy-agreements/${ta}/sign`,{method:'POST',body:{signature_name:'Someone Else',signature:png,accepted_terms:true,accepted_binding:true,accepted_payment_schedule:true}})).status,409);
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
  await test('tenancy end preview is personalised, read-only and excludes internal notes', async()=>{
    const preview=await ok(`/api/tenants/${tenantId}/tenancy-end`,{method:'POST',token:auth.staff,body:{end_date:today,notes:'Private-only test note',send_email:true,preview_only:true}});
    assert.equal(preview.previews.length,2);for(const p of preview.previews){assert.match(p.html,/tenancy-end.png/);assert(!p.html.includes('Private-only'));assert(!p.html.includes('{{'));assert.match(p.sms,/Further details/);}
    assert.equal((await one('SELECT tenancy_end_date FROM tenants WHERE id=$1',[tenantId])).tenancy_end_date,null);
    assert.equal((await request(`/api/tenants/${tenantId}/tenancy-end`,{method:'POST',token:auth.staff,body:{end_date:'2026-02-31'}})).status,400);
    assert.equal((await request(`/api/tenants/${tenantId}/tenancy-end`,{method:'POST',token:auth.viewer,body:{end_date:today}})).status,403);
  });
  await test('end scheduling updates both tenants, preserves notes and retains them through end date',async()=>{
    const result=await ok(`/api/tenants/${tenantId}/tenancy-end`,{method:'POST',token:auth.staff,body:{end_date:today,notes:'Private-only test note'}});
    assert.equal(result.scheduled.length,2);assert.deepEqual(result.failures,[]);
    const rows=await sql('SELECT * FROM tenants WHERE property_id=$1',[property.id]);for(const t of rows){assert.equal(t.has_end_date,1);assert.equal(t.status,'active');assert.match(t.notes,/Private-only/);}
    assert.equal((await ok(`/api/properties/${property.id}`,{token:auth.staff})).status,'let');
    await ok(`/api/tenants/${tenantId}`,{method:'PUT',token:auth.staff,body:{guarantor_date_of_birth:'1980-01-01',guarantor_employer:'Test Company',guarantor_primary_id:1}});
    assert.equal((await one('SELECT guarantor_primary_id FROM tenants WHERE id=$1',[tenantId])).guarantor_primary_id,1);
  });
  await test('portfolio master ownership is visible and cannot be changed via either link API',async()=>{
    const landlords=await ok(`/api/properties/${property.id}/landlords`,{token:auth.staff});assert.equal(landlords.length,1);assert.equal(landlords[0].id,landlord.id);
    assert.equal((await request(`/api/properties/${property.id}/landlords`,{method:'POST',token:auth.staff,body:{landlord_id:landlord.id,is_primary:true}})).status,409);
    assert.equal((await request('/api/property-landlords',{method:'POST',token:auth.staff,body:{property_id:property.id,landlord_id:landlord.id}})).status,409);
  });
  await test('future tenants make property Let Agreed; prior tenants archive and new tenants activate by UK date',async()=>{
    await sql("UPDATE tenants SET tenancy_end_date=CURRENT_DATE-1, tenancy_start_date=CURRENT_DATE-365 WHERE property_id=$1",[property.id]);
    const next=await one("INSERT INTO tenants(name,first_name_1,last_name_1,property_id,status,tenancy_start_date,email,phone) VALUES('Next Tenant','Next','Tenant',$1,'scheduled',CURRENT_DATE+5,'next@example.test','07700900003') RETURNING id",[property.id]);
    assert.equal((await ok(`/api/properties/${property.id}`,{token:auth.staff})).status,'let_agreed');
    assert.equal((await one('SELECT status FROM tenants WHERE id=$1',[tenantId])).status,'inactive');
    await sql('UPDATE tenants SET tenancy_start_date=CURRENT_DATE WHERE id=$1',[next.id]);
    assert.equal((await ok(`/api/properties/${property.id}`,{token:auth.staff})).status,'let');
    assert.equal((await one('SELECT status FROM tenants WHERE id=$1',[next.id])).status,'active');
    const failed=await ok(`/api/tenants/${next.id}/tenancy-end`,{method:'POST',token:auth.staff,body:{end_date:today,send_email:true,send_sms:true}});
    assert.equal(failed.failures.length,2);assert.equal((await one('SELECT has_end_date FROM tenants WHERE id=$1',[next.id])).has_end_date,1);
  });

  let reviewTenant, reviewPartner, reviewProperty, reviewId;
  await test('rent review validates dates, notice ownership and staff permissions; joint duplicate is blocked',async()=>{
    reviewProperty=await one("INSERT INTO properties(address,postcode,landlord_id,rent_amount) VALUES('Rent Review Test','WV1 1AA',$1,1000) RETURNING id",[landlord.id]);
    reviewTenant=await one("INSERT INTO tenants(name,first_name_1,last_name_1,email,phone,property_id,status,tenancy_start_date,monthly_rent,is_joint_tenancy) VALUES('Review A','Review','A','review-a@example.test','07700900004',$1,'active','2024-01-15',1000,1) RETURNING id",[reviewProperty.id]);
    reviewPartner=await one("INSERT INTO tenants(name,first_name_1,last_name_1,email,phone,property_id,status,tenancy_start_date,monthly_rent,is_joint_tenancy,linked_tenant_id) VALUES('Review B','Review','B','review-b@example.test','07700900005',$1,'active','2024-01-15',1000,1,$2) RETURNING id",[reviewProperty.id,reviewTenant.id]);
    await sql('UPDATE tenants SET linked_tenant_id=$1 WHERE id=$2',[reviewPartner.id,reviewTenant.id]);
    const doc=await one("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('tenant',$1,'Form 4A','sample.pdf','notice.pdf','application/pdf','approved') RETURNING id",[reviewTenant.id]);
    const future=new Date(today+'T12:00:00Z');future.setUTCMonth(future.getUTCMonth()+3,15);
    const body={new_rent:1100,notice_document_id:doc.id,notice_served_date:today,effective_date:future.toISOString().slice(0,10),last_increase_date:'2025-01-15',service_method:'post',notes:'Test evidence of service on both tenants',confirmed:true};
    const route=`/api/tenants/${reviewTenant.id}/rent-reviews`;
    assert.equal((await request(route,{method:'POST',token:auth.viewer,body})).status,403);
    assert.equal((await request(route,{method:'POST',token:auth.staff,body:{...body,effective_date:today}})).status,400);
    assert.equal((await request(route,{method:'POST',token:auth.staff,body:{...body,notice_document_id:999999}})).status,400);
    const review=await ok(route,{method:'POST',token:auth.staff,body});reviewId=review.id;
    assert.equal((await request(`/api/tenants/${reviewPartner.id}/rent-reviews`,{method:'POST',token:auth.staff,body})).status,409);
    assert.equal((await request(`/api/documents/download/${doc.id}`,{token:auth.staff})).status,200);
    assert.equal((await request(`/api/documents/${doc.id}`,{method:'DELETE',token:auth.staff})).status,409);
    assert.equal((await ok(`/api/tenants/${reviewPartner.id}/rent-reviews`,{token:auth.staff}))[0].id,reviewId);
    assert.equal(Number((await one('SELECT monthly_rent FROM tenants WHERE id=$1',[reviewTenant.id])).monthly_rent),1000);
  });
  await test('paused increases never apply; due increases apply once to joint tenancy and preserve historic receipts',async()=>{
    await ok(`/api/rent-reviews/${reviewId}`,{method:'PATCH',token:auth.staff,body:{status:'paused',reason:'Tenant challenge received'}});
    await sql('UPDATE rent_reviews SET effective_date=$1 WHERE id=$2',[today,reviewId]);
    await ok(`/api/tenants/${reviewTenant.id}/rent-reviews`,{token:auth.staff});
    assert.equal(Number((await one('SELECT monthly_rent FROM tenants WHERE id=$1',[reviewTenant.id])).monthly_rent),1000);
    const old=await one("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,status) VALUES($1,$2,CURRENT_DATE-1,1000,'late') RETURNING id",[reviewProperty.id,reviewTenant.id]);
    const pending=await one("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,status) VALUES($1,$2,CURRENT_DATE+1,1000,'pending') RETURNING id",[reviewProperty.id,reviewTenant.id]);
    const paid=await one("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status) VALUES($1,$2,CURRENT_DATE+2,1000,1000,'paid') RETURNING id",[reviewProperty.id,reviewTenant.id]);
    await ok(`/api/rent-reviews/${reviewId}`,{method:'PATCH',token:auth.staff,body:{status:'scheduled',reason:'Challenge withdrawn, original notice remains valid',confirmed:true}});
    await Promise.all([1,2,3].map(()=>ok(`/api/tenants/${reviewTenant.id}/rent-reviews`,{token:auth.staff})));
    for(const t of await sql('SELECT monthly_rent FROM tenants WHERE property_id=$1',[reviewProperty.id]))assert.equal(Number(t.monthly_rent),1100);
    assert.equal(Number((await one('SELECT rent_amount FROM properties WHERE id=$1',[reviewProperty.id])).rent_amount),1100);
    assert.equal(Number((await one('SELECT amount_due FROM rent_payments WHERE id=$1',[pending.id])).amount_due),1100);
    for(const p of [old,paid])assert.equal(Number((await one('SELECT amount_due FROM rent_payments WHERE id=$1',[p.id])).amount_due),1000);
    assert.equal((await one("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND changes::jsonb->>'action'='rent_increase_applied'",[reviewTenant.id])).n,1);
    assert.equal((await request(`/api/rent-reviews/${reviewId}`,{method:'PATCH',token:auth.staff,body:{status:'cancelled',reason:'Too late'}})).status,409);
  });
  await test('completion overrides are audited, reversible, require reasons and preserve actual KYC evidence',async()=>{
    const route=`/api/tenants/${reviewTenant.id}/completion-overrides`,body={key:'kyc_primary_id',complete:true,reason:'Evidence checked offline'};
    assert.equal((await request(route,{method:'PUT',token:auth.viewer,body})).status,403);
    assert.equal((await request(route,{method:'PUT',token:auth.staff,body:{...body,reason:''}})).status,400);
    assert.equal((await request(route,{method:'PUT',token:auth.staff,body:{...body,key:'monthly_rent'}})).status,400);
    const saved=await ok(route,{method:'PUT',token:auth.staff,body});assert.equal(saved.completion_overrides.kyc_primary_id.by,'staff@example.test');
    const tenant=await ok(`/api/tenants/${reviewTenant.id}`,{token:auth.staff});assert.equal(tenant.kyc_primary_id,0);assert.equal(tenant.completion_overrides.kyc_primary_id.reason,body.reason);
    const removed=await ok(route,{method:'PUT',token:auth.staff,body:{key:body.key,complete:false}});assert.deepEqual(removed.completion_overrides,{});
  });
  await test('permission requests support viewers, reject duplicates and enforce admin review without self-lockout',async()=>{
    const viewer=(await one("SELECT id FROM users WHERE role='viewer'"));const admin=(await one("SELECT id FROM users WHERE role='admin'"));
    const requestBody={requested_role:'staff',reason:'Help maintain property records'};
    const created=await request('/api/permission-requests',{method:'POST',token:auth.viewer,body:requestBody});assert.equal(created.status,201);const pending=created.data;
    assert.equal((await request('/api/permission-requests',{method:'POST',token:auth.viewer,body:requestBody})).status,409);
    assert.equal((await request(`/api/permission-requests/${pending.id}`,{method:'PUT',token:auth.staff,body:{status:'approved'}})).status,403);
    await ok(`/api/permission-requests/${pending.id}`,{method:'PUT',token:auth.admin,body:{status:'approved'}});
    assert.equal((await ok('/api/auth/me',{token:auth.viewer})).user.role,'staff');
    assert.equal((await request(`/api/users/${admin.id}`,{method:'PUT',token:auth.admin,body:{is_active:0}})).status,400);
    assert.equal((await request(`/api/users/${admin.id}`,{method:'PUT',token:auth.admin,body:{role:'staff'}})).status,400);
    await ok(`/api/users/${viewer.id}`,{method:'PUT',token:auth.admin,body:{role:'viewer'}});
  });
  await test('activity deduplicates minutes and is visible only to administrators',async()=>{
    const staff=await one("SELECT id FROM users WHERE role='staff'");
    await Promise.all([1,2,3].map(()=>ok('/api/activity/heartbeat',{method:'POST',token:auth.staff,body:{page:'/tenants/1-test'}})));
    const stats=await ok(`/api/users/${staff.id}/activity`,{token:auth.admin});assert.equal(stats.usage.today_minutes,1);
    assert.equal((await request(`/api/users/${staff.id}/activity`,{token:auth.staff})).status,403);
    assert.equal((await request('/api/activity/heartbeat',{method:'POST',token:auth.viewer,body:{page:'/tenant?token=secret'}})).status,400);
    await ok('/api/activity/heartbeat',{method:'POST',token:auth.viewer,body:{page:'/settings',navigation:true}});
    assert.equal((await one("SELECT count(*)::int n FROM audit_log WHERE entity_type='page' AND changes::jsonb->>'page'='/settings'")).n,1);
    assert.equal((await request(`/api/users/${staff.id}/activity?offset=-1`,{token:auth.admin})).status,400);
  });
  await test('tenant dates and consent persist; archive and delete are administrator-only',async()=>{
    await ok(`/api/tenants/${reviewTenant.id}`,{method:'PUT',token:auth.staff,body:{rent_last_reviewed:today,guarantor_authority_to_contact:true}});
    const record=await ok(`/api/tenants/${reviewTenant.id}`,{token:auth.staff});assert.equal(record.guarantor_authority_to_contact,1);assert.equal(record.rent_last_reviewed.slice(0,10),today);
    assert.equal((await request(`/api/tenants/${reviewTenant.id}`,{method:'PUT',token:auth.staff,body:{rent_last_reviewed:'2026-02-30'}})).status,400);
    assert.equal((await request(`/api/tenants/${reviewTenant.id}`,{method:'PUT',token:auth.staff,body:{status:'inactive'}})).status,403);
    assert.equal((await request('/api/tenants/bulk-archive',{method:'POST',token:auth.staff,body:{ids:[reviewTenant.id]}})).status,403);
    assert.equal((await request(`/api/tenants/${reviewTenant.id}`,{method:'DELETE',token:auth.staff})).status,403);
    assert.equal((await request(`/api/properties/${reviewProperty.id}`,{method:'DELETE',token:auth.staff})).status,403);
    assert.equal((await request(`/api/tenants/${reviewTenant.id}`,{method:'DELETE',token:auth.admin})).status,409);
  });
  await test('incoming SMS matches active tenants, is retry-safe, and appears in their communication history',async()=>{
    const body={From:'+447700900004',To:'+447700900999',Body:'Integration test reply',MessageSid:'SM'+'a'.repeat(32)};
    await Promise.all([1,2].map(()=>ok('/api/sms/inbound',{method:'POST',body})));
    assert.equal((await one('SELECT count(*)::int n FROM sms_messages WHERE twilio_sid=$1',[body.MessageSid])).n,1);
    const messages=await ok(`/api/tenants/${reviewTenant.id}/communications`,{token:auth.staff});assert(messages.some(m=>m.direction==='inbound'&&m.body===body.Body));
  });
  await test('Flemo reads live scoped records and does not fabricate unsupported actions',async()=>{
    const chat=message=>ok('/api/ai/chat',{method:'POST',token:auth.viewer,body:{message}});
    assert.match((await chat('What is our monthly rental income?')).text,/Joint tenants count once/);
    assert.match((await chat('Which tenants are missing ID?')).text,/Review A/);
    assert.match((await chat('Which tenancies end soon?')).text,/60 days/);
    assert.match((await chat('Which rent reviews are due this month?')).text,/calendar month/);
    await sql("INSERT INTO sms_messages(entity_type,entity_id,to_phone,message_body,direction,status) VALUES('tenant',$1,'07700900004','A recorded test message','outbound','sent')",[reviewTenant.id]);
    assert.match((await chat('What was the last SMS to Review A?')).text,/A recorded test message/);
    for(const type of ['Primary Identification','Secondary Identification']) await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,review_status) VALUES('tenant',$1,$2,'sample.pdf','Pending ID.pdf','pending')",[reviewTenant.id,type]);
    assert(!(await chat('Which tenants are missing ID?')).text.includes('Review A'));
    await sql("UPDATE documents SET review_status='rejected' WHERE entity_type='tenant' AND entity_id=$1 AND doc_type='Secondary Identification'",[reviewTenant.id]);
    assert((await chat('Which tenants are missing ID?')).text.includes('Review A'));
    await sql("UPDATE tenants SET name='Mathew Woodberry' WHERE id=$1",[reviewTenant.id]);
    assert.match((await chat('What was the last SMS to Matthew Woodberry?')).text,/A recorded test message/);
    await sql("UPDATE tenants SET name='Review A' WHERE id=$1",[reviewTenant.id]);
    assert.match((await chat('Delete everything')).text,/No matching record/);
    assert.match((await chat('Tell me about Review A')).text,/Review A/);
    assert.match((await chat('Who pays late?')).text,/recorded.*payments/);
    assert.equal((await ok('/api/ai/account',{token:auth.viewer})).connected,false);
  });
  await test('clear recent tasks preserves calendar records and is restricted to administrators',async()=>{
    const before=(await one('SELECT count(*)::int n FROM tasks')).n;
    assert.equal((await request('/api/tasks/clear-recent',{method:'POST',token:auth.staff,body:{}})).status,403);
    await ok('/api/tasks/clear-recent',{method:'POST',token:auth.admin,body:{}});
    assert.equal((await one('SELECT count(*)::int n FROM tasks')).n,before);
    assert.equal((await one('SELECT count(*)::int n FROM tasks WHERE dashboard_dismissed_at IS NULL')).n,0);
  });
  await test('joint holding requests and reminders preserve individual recipients and links from either record',async()=>{
    const pair=[];
    for(const name of ['First','Second'])pair.push(await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,phone_1,linked_property_id,is_joint_application,status) VALUES($1,'Applicant',$2,$3,$4,1,'new') RETURNING id",[name,name.toLowerCase()+'-applicant@example.test',name==='First'?'07700900007':'07700900008',reviewProperty.id]));
    const [x,y]=pair.map(p=>p.id);await sql('UPDATE tenant_enquiries SET joint_partner_id=$2 WHERE id=$1',[x,y]);await sql('UPDATE tenant_enquiries SET joint_partner_id=$2 WHERE id=$1',[y,x]);
    const amounts={monthly_rent:1234,security_deposit:1400,holding_deposit:250,send_email:true,send_sms:true,follow_up_date:today};
    const preview=await ok(`/api/tenant-enquiries/${y}/holding-deposit/email-preview`,{method:'POST',token:auth.staff,body:amounts});assert.match(preview.html,/1,234/);assert.match(preview.html,/Second/);
    const issued=await ok(`/api/tenant-enquiries/${y}/request-holding-deposit`,{method:'POST',token:auth.staff,body:amounts});assert.equal(Object.keys(issued.delivery).length,4);
    const rows=await sql('SELECT id,application_form_slug,status,monthly_rent_agreed FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id',[[x,y]]);
    assert.notEqual(rows[0].application_form_slug,rows[1].application_form_slug);assert(rows.every(r=>r.status==='awaiting_response'&&Number(r.monthly_rent_agreed)===1234));
    const emailRows=await sql("SELECT entity_id,to_email,body_html FROM email_messages WHERE entity_id=ANY($1::int[]) AND template='holding_deposit_request' ORDER BY entity_id",[[x,y]]);
    assert.equal(emailRows.length,2);for(let i=0;i<2;i++){assert(emailRows[i].body_html.includes(rows[i].application_form_slug));assert(!emailRows[i].body_html.includes(rows[1-i].application_form_slug));}
    await ok(`/api/tenant-enquiries/${x}/send-application-email`,{method:'POST',token:auth.staff,body:{send_email:true,send_sms:false}});
    const reminders=await sql("SELECT entity_id,to_email,body_html FROM email_messages WHERE entity_id=ANY($1::int[]) AND template='tenancy_application' ORDER BY entity_id",[[x,y]]);assert.equal(reminders.length,2);for(let i=0;i<2;i++){assert(reminders[i].body_html.includes(rows[i].application_form_slug));assert(reminders[i].body_html.includes('Dear '+(i===0?'First':'Second')));assert(!reminders[i].body_html.includes('Dear Kirsty'));}
    const noMessages=await ok(`/api/tenant-enquiries/${x}/send-application-email`,{method:'POST',token:auth.staff,body:{send_email:false,send_sms:false}});assert.equal(Object.keys(noMessages.delivery).length,0);
    await ok(`/api/tenant-enquiries/${y}/confirm-holding-deposit`,{method:'POST',token:auth.staff,body:{amount:250,received_date:today,send_email:true,send_sms:false}});
    const receipts=await sql("SELECT entity_id,to_email,body_html FROM email_messages WHERE entity_id=ANY($1::int[]) AND template='holding_deposit_receipt'",[[x,y]]);assert.equal(receipts.length,2);assert(receipts.find(r=>r.entity_id===y).body_html.includes('Second'));
    await ok(`/api/tenant-enquiries/${x}`,{method:'PUT',token:auth.staff,body:{preferred_property_type:'House,Bungalow'}});assert.equal((await one('SELECT preferred_property_type FROM tenant_enquiries WHERE id=$1',[y])).preferred_property_type,'House,Bungalow');
    await Promise.all(['Note one','Note two'].map(text=>ok(`/api/tenant-enquiries/${x}/notes`,{method:'POST',token:auth.staff,body:{text}})));
    const notes=JSON.parse((await one('SELECT notes FROM tenant_enquiries WHERE id=$1',[x])).notes);assert(notes.some(n=>n.text==='Note one'));assert(notes.some(n=>n.text==='Note two'));
    assert.equal((await request(`/api/tenant-enquiries/${x}/no-handover`,{method:'POST',token:auth.staff,body:{confirmed:true}})).status,409);
    await sql('UPDATE tenant_enquiries SET balance_payment_received=1 WHERE id=ANY($1::int[])',[[x,y]]);
    await ok(`/api/tenant-enquiries/${y}/no-handover`,{method:'POST',token:auth.staff,body:{confirmed:true}});assert((await sql('SELECT handover_not_required FROM tenant_enquiries WHERE id=ANY($1::int[])',[[x,y]])).every(r=>r.handover_not_required));
  });
  await test('inventory rooms, notes and completion persist; photos cannot attach to another inventory',async()=>{
    const inventory=await ok('/api/inventories',{method:'POST',token:auth.staff,body:{property_id:reviewProperty.id,tenant_id:reviewTenant.id,inventory_type:'check_in',inspection_date:today}});
    const room=await ok(`/api/inventories/${inventory.id}/rooms`,{method:'POST',token:auth.staff,body:{room_name:'Kitchen',room_type:'kitchen'}});
    await ok(`/api/inventory-rooms/${room.id}`,{method:'PUT',token:auth.staff,body:{condition:'good',notes:'Sink and taps checked'}});
    assert.equal((await ok(`/api/inventories/${inventory.id}/rooms`,{token:auth.staff}))[0].notes,'Sink and taps checked');
    const other=await ok('/api/inventories',{method:'POST',token:auth.staff,body:{property_id:reviewProperty.id,tenant_id:reviewTenant.id,inventory_type:'periodic',inspection_date:today}});
    const form=new FormData();form.append('file',new Blob([Buffer.from(png.split(',')[1],'base64')],{type:'image/png'}),'test.png');
    assert.equal((await fetch(`${base}/api/inventory-photos/${other.id}/${room.id}`,{method:'POST',headers:{Authorization:`Bearer ${auth.staff}`},body:form})).status,400);
    const upload=await fetch(`${base}/api/inventory-photos/${inventory.id}/${room.id}`,{method:'POST',headers:{Authorization:`Bearer ${auth.staff}`},body:form});
    assert.equal(upload.status,200); const photo=await upload.json();
    assert.equal((await fetch(`${base}/uploads/inventory/${photo.filename}`)).status,401);
    assert.equal((await fetch(`${base}/uploads/inventory/${photo.filename}`,{headers:{Authorization:`Bearer ${auth.viewer}`}})).status,200);
    await ok(`/api/inventories/${inventory.id}/complete`,{method:'PUT',token:auth.staff,body:{}});
    assert.equal((await ok(`/api/inventories/${inventory.id}`,{token:auth.staff})).status,'completed');
    const reviews=await sql('SELECT * FROM inventory_reviews WHERE inventory_id=$1 ORDER BY tenant_id',[inventory.id]);
    assert.equal(reviews.length,2);assert.notEqual(reviews[0].token,reviews[1].token);
    const [reviewA,reviewB]=reviews;
    assert.equal((await request(`/api/inventory-rooms/${room.id}`,{method:'PUT',token:auth.staff,body:{notes:'Change issued content'}})).status,409);
    await assert.rejects(()=>sql('UPDATE inventories SET notes=$1 WHERE id=$2',['Change issued content',inventory.id]),/Issued inventories/);
    const reviewPath=`/api/public/inventory/${reviewA.token}`;
    assert.equal((await request(`${reviewPath}/sign`,{method:'POST',body:{signature_name:'Review A',confirmed:true}})).status,400);
    await ok(`${reviewPath}/photos/${photo.id}`,{method:'PUT',body:{approved:false,comment:'Scratch next to the tap'}});
    assert.equal((await ok(`/api/public/inventory/${reviewB.token}`)).photos[0].comment,null);
    await ok(`${reviewPath}/sign`,{method:'POST',body:{signature_name:'Review A',confirmed:true,general_comments:'Recorded at move-in'}});
    assert.equal((await request(`${reviewPath}/photos/${photo.id}`,{method:'PUT',body:{approved:true,comment:''}})).status,409);
    const office=await ok(`/api/inventories/${inventory.id}/reviews/${reviewA.id}`,{token:auth.staff});
    assert.equal(office.signature_name,'Review A');assert.equal(office.photos[0].comment,'Scratch next to the tap');
    assert.equal((await one('SELECT signed_at FROM inventory_reviews WHERE id=$1',[reviewB.id])).signed_at,null);
    assert.equal((await request(`/api/inventories/${other.id}/reviews/${reviewA.id}`,{token:auth.staff})).status,404);

    assert.equal((await request('/api/inventories',{method:'POST',token:auth.viewer,body:{}})).status,403);
  });
  await test('property features persist and shared documents survive record deletion and rollback',async()=>{
    const disposable=await one("INSERT INTO tenants(name,first_name_1,last_name_1) VALUES('Disposable Test','Disposable','Test') RETURNING id");
    await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name) VALUES('tenant',$1,'Other','sample.pdf','shared.pdf')",[disposable.id]);
    await ok(`/api/tenants/${disposable.id}`,{method:'DELETE',token:auth.admin}); assert(existsSync(path.join(dir,'sample.pdf')));
    const blocked=await one("INSERT INTO tenants(name,first_name_1,last_name_1) VALUES('Rollback Test','Rollback','Test') RETURNING id");
    writeFileSync(path.join(dir,'rollback.pdf'),pdf);
    await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name) VALUES('tenant',$1,'Other','rollback.pdf','rollback.pdf')",[blocked.id]);
    await sql('CREATE TABLE deletion_blocker(tenant_id INTEGER REFERENCES tenants(id))');
    await sql('INSERT INTO deletion_blocker VALUES($1)',[blocked.id]);
    assert.equal((await request(`/api/tenants/${blocked.id}`,{method:'DELETE',token:auth.admin})).status,500);
    assert(existsSync(path.join(dir,'rollback.pdf'))); assert(await one('SELECT id FROM tenants WHERE id=$1',[blocked.id]));
    await sql('DROP TABLE deletion_blocker');
    await ok(`/api/properties/${reviewProperty.id}`,{method:'PUT',token:auth.staff,body:{amenities:'CCTV,Garden',bedrooms:3}});
    const saved=await ok(`/api/properties/${reviewProperty.id}`,{token:auth.staff});assert.equal(saved.amenities,'CCTV,Garden');assert.equal(saved.bedrooms,3);
  });
  await test('client landlord signs before applicant; completed APT converts with its contract attached',async()=>{
    const owner=await one("INSERT INTO landlords(name,email,address,landlord_type) VALUES('Client Owner','owner@example.test','2 Test Street','external') RETURNING id");
    const home=await one("INSERT INTO properties(address,postcode,landlord_id,has_gas,rent_amount,epc_expiry_date,eicr_expiry_date,service_type) VALUES('Client Test Home','WV1 1AA',$1,0,850,'2030-01-01','2030-01-01','full_management') RETURNING id",[owner.id]);
    for(const type of ['EPC','EICR']) await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('property',$1,$2,'sample.pdf',$3,'application/pdf','approved')",[home.id,type,type+'.pdf']);
    const applicant=await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,phone_1,linked_property_id,holding_deposit_received,application_form_completed,application_review_status,credit_check_completed,monthly_rent_agreed,current_address_1) VALUES('Client','Applicant','client@example.test','07700900009',$1,1,1,'approved',1,850,'Previous Test Home') RETURNING id",[home.id]);
    await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('tenant_enquiry',$1,'Credit Check Report','sample.pdf','Client credit.pdf','application/pdf','approved')",[applicant.id]);
    const apt=await ok(`/api/tenant-enquiries/${applicant.id}/tenancy-agreement`,{method:'POST',token:auth.staff,body:{...issueBody,rent:850,deposit:850}});
    assert.equal(apt.agreement_type,'client');assert(apt.landlord_url);
    const tenantToken=new URL(apt.tenant_url).pathname.slice(1), ownerToken=new URL(apt.landlord_url).pathname.slice(1);
    const sign=token=>request(`/api/public/tenancy-agreements/${token}/sign`,{method:'POST',body:{signature_name:token===ownerToken?'Client Owner':'Client Applicant',signature:png,accepted_terms:true,accepted_binding:true,accepted_payment_schedule:true}});
    assert.equal((await sign(tenantToken)).status,409);assert.equal((await sign(ownerToken)).status,200);assert.equal((await sign(tenantToken)).status,200);
    assert.equal((await one('SELECT status FROM tenancy_agreements WHERE id=$1',[apt.agreement_id])).status,'completed');
    await ok(`/api/tenant-enquiries/${applicant.id}/request-balance`,{method:'POST',token:auth.staff,body:{follow_up_date:today,send_email:false,send_sms:false}});
    await ok(`/api/tenant-enquiries/${applicant.id}/confirm-balance`,{method:'POST',token:auth.staff,body:{}});
    await ok(`/api/tenant-enquiries/${applicant.id}/schedule-handover`,{method:'POST',token:auth.staff,body:{handover_date:today,handover_time:'10:00',assigned_to:'Test staff'}});
    await ok(`/api/tenant-enquiries/${applicant.id}/convert`,{method:'POST',token:auth.staff,body:{property_id:home.id,tenancy_start_date:today}});
    const tenant=await one('SELECT id FROM tenants WHERE source_enquiry_id=$1',[applicant.id]);
    assert(await one("SELECT id FROM documents WHERE entity_type='tenant' AND entity_id=$1 AND doc_type='Signed Tenancy Agreement'",[tenant.id]));
  });
  await test('application review is atomic and supports revising approved documents',async()=>{
    const e=await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,status,notes) VALUES('Review','Draft','review-draft@example.test','onboarding','[]') RETURNING id");
    const d=await one("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('tenant_enquiry',$1,'Other','sample.pdf','Draft ID.pdf','application/pdf','pending') RETURNING id",[e.id]);
    const review=body=>request(`/api/tenant-enquiries/${e.id}/application-review`,{method:'POST',token:auth.staff,body});
    assert.equal((await review({status:'approved',document_decisions:[{id:d.id,status:'approved'}]})).status,409);
    assert.equal((await one('SELECT review_status FROM documents WHERE id=$1',[d.id])).review_status,'pending');
    assert.equal((await review({status:'changes_requested',document_decisions:[{id:d.id,status:'rejected'}]})).status,400);
    await ok(`/api/documents/${d.id}/review`,{method:'PUT',token:auth.staff,body:{status:'approved'}});
    assert.equal((await review({status:'changes_requested',changes_required:'Clear image required',notes:'Office review note',document_decisions:[{id:d.id,status:'rejected'}],send_email:false,send_sms:false})).status,200);
    assert.equal((await one('SELECT review_status FROM documents WHERE id=$1',[d.id])).review_status,'rejected');
    assert(JSON.parse((await one('SELECT notes FROM tenant_enquiries WHERE id=$1',[e.id])).notes).some(n=>n.text==='Office review note'));
    await ok(`/api/documents/${d.id}/category`,{method:'PUT',token:auth.staff,body:{doc_type:'Primary Identification'}});
    assert.equal((await one('SELECT application_review_status FROM tenant_enquiries WHERE id=$1',[e.id])).application_review_status,'pending');
  });
  await test('landlord registration validates addresses and company owners; token protects attached documents',async()=>{
    const base={registration_type:'Limited Company',firstName:'Owner',surname:'Test',email:'intake@example.test',phone:'07700900111',address:'10 Test Road',city:'Wolverhampton',postcode:'WV1 1AA',propertyAddress:'20 Test Road',propertyCity:'Wolverhampton',propertyPostcode:'WV1 1BB',company_name:'Example Ltd',company_number:'12345678',company_address:'30 Test Road',companyCity:'Wolverhampton',companyPostcode:'WV1 1CC'};
    assert.equal((await request('/api/public/landlord-enquiries',{method:'POST',body:base})).status,400);
    const created=await request('/api/public/landlord-enquiries',{method:'POST',body:{...base,beneficial_owners:'Owner Test 100%'}});assert.equal(created.status,201,JSON.stringify(created.data));
    const url=`/api/public/landlord-enquiries/${created.data.enquiry_id}/documents`;
    const body=new FormData();body.append('documents',new Blob([pdf],{type:'application/pdf'}),'Ownership.pdf');body.append('doc_type','Proof of Ownership');
    assert.equal((await fetch(`http://127.0.0.1:${port}`+url,{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${passed+1}`},body})).status,403);
    const response=await fetch(`http://127.0.0.1:${port}`+url+'?token='+created.data.upload_token,{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${passed+1}`},body});assert.equal(response.status,200,await response.text());
    const docs=await ok(`/api/documents/landlord_bdm/${created.data.enquiry_id}`,{token:auth.staff});assert(docs.some(d=>d.doc_type==='Proof of Ownership'&&d.review_status==='pending'));
    assert.equal((await one('SELECT intake_data FROM landlords_bdm WHERE id=$1',[created.data.enquiry_id])).intake_data.beneficial_owners,'Owner Test 100%');
  });
  console.log(`\n${passed} integration scenarios passed. Private artifacts: ${dir}`);
} catch(error) { console.error(error); console.error('Server log:',path.join(dir,'server.log')); process.exitCode=1; }
finally { server.kill('SIGTERM'); await once(server,'exit').catch(()=>{}); await db.end(); }
