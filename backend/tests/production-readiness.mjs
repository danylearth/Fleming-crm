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
    const signedText=spawnSync('pdftotext',[path.join(dir,row.signed_filename),'-'],{encoding:'utf8'});assert.equal(signedText.status,0);assert((signedText.stdout.match(/Signed on:/g)||[]).length>=11,'Applicable receipt acknowledgements, both tenants and landlord sign in the addendum; tenants also sign the main agreement');
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
  await test('financial grants take effect immediately and staff cannot grant themselves access',async()=>{
    assert.equal((await request('/api/financial-summary',{token:auth.staff})).status,403);
    const staff=await one("SELECT id FROM users WHERE email='staff@example.test'");
    assert.equal((await request(`/api/users/${staff.id}`,{method:'PUT',token:auth.staff,body:{finance_access:true}})).status,403);
    await ok(`/api/users/${staff.id}`,{method:'PUT',token:auth.admin,body:{finance_access:true}});
    assert.equal((await request('/api/financial-summary',{token:auth.staff})).status,200);
    assert.equal((await request('/api/bank-feed/transactions',{token:auth.viewer})).status,403);
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
    assert.equal(preview.previews.length,2);for(const p of preview.previews){assert.match(p.html,/moving-day.png/);assert(!p.html.includes('Private-only'));assert(!p.html.includes('{{'));assert.match(p.sms,/we can confirm that your tenancy agreement is set to end/);}
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
    const chat=(message,token=auth.viewer)=>ok('/api/ai/chat',{method:'POST',token,body:{message}});
    assert.equal((await request('/api/ai/chat',{method:'POST',token:auth.viewer,body:{message:'What is our monthly rental income?'}})).status,403);
    assert.match((await chat('What is our monthly rental income?',auth.staff)).text,/Joint tenants count once/);
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
    assert.match((await chat('Who pays late?',auth.staff)).text,/recorded.*payments/);
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
    const ownPhoto=new FormData();ownPhoto.append('file',new Blob([await (await import('sharp')).default({create:{width:8,height:8,channels:3,background:'#ffffff'}}).png().toBuffer()],{type:'image/png'}),'review-photo.png');ownPhoto.append('caption','Extra tenant evidence');
    assert.equal((await fetch(`${base}/api/public/inventory/${reviewB.token}/photos`,{method:'POST',body:ownPhoto})).status,200);
    await ok(`/api/public/inventory/${reviewB.token}/photos/${photo.id}`,{method:'PUT',body:{approved:true,comment:''}});
    await ok(`/api/public/inventory/${reviewB.token}/sign`,{method:'POST',body:{signature_name:'Review B',confirmed:true}});
    const finalDocs=await sql('SELECT * FROM documents WHERE inventory_id=$1',[inventory.id]);assert.equal(finalDocs.length,3);assert(finalDocs.every(d=>d.original_name.startsWith('Signed Inventory')));
    const finalPdf=await PDFDocument.load(readFileSync(path.join(dir,finalDocs[0].filename)));assert(finalPdf.getPageCount()>=5);

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
    for(const service of ['rent_collection','let_only']) {
      await sql('UPDATE properties SET service_type=$1 WHERE id=$2',[service,home.id]);
      const e=await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,linked_property_id,holding_deposit_received,application_form_completed,application_review_status,credit_check_completed,monthly_rent_agreed,current_address_1) VALUES('Service','Test','service@example.test',$1,1,1,'approved',1,850,'Previous Home') RETURNING id",[home.id]);
      await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('tenant_enquiry',$1,'Credit Check Report','sample.pdf','Credit.pdf','application/pdf','approved')",[e.id]);
      const defaults=await ok(`/api/tenant-enquiries/${e.id}/tenancy-agreement-compliance`,{token:auth.staff});assert.match(defaults.defaults.paymentReference,/TEST$/);
      const input={...issueBody,rent:850,deposit:850,payment_reference:'MY CUSTOM REFERENCE',landlord_bank_sort_code:'123456',landlord_bank_account_number:'12345678',landlord_bank_account_name:'Client Owner',landlord_bank_name:'Test Bank'};
      if(service==='let_only')assert.equal((await request(`/api/tenant-enquiries/${e.id}/tenancy-agreement`,{method:'POST',token:auth.staff,body:{...input,landlord_bank_account_number:''}})).status,400);
      const made=await ok(`/api/tenant-enquiries/${e.id}/tenancy-agreement`,{method:'POST',token:auth.staff,body:input});const saved=await one('SELECT * FROM tenancy_agreements WHERE id=$1',[made.agreement_id]);assert(saved.requires_landlord_signature);assert.equal(saved.agreement_type,'client');
      assert.equal(saved.agreement_details.bankDetails.accountNumber,service==='let_only'?'12345678':'03803880');assert.equal(saved.agreement_details.paymentReference,service==='let_only'?'MY CUSTOM REFERENCE':defaults.defaults.paymentReference);
      const extracted=spawnSync('pdftotext',[path.join(dir,saved.filename),'-'],{encoding:'utf8'});assert.equal(extracted.status,0);assert(!extracted.stdout.includes('Signed by Robert Fleming'));assert(extracted.stdout.includes('Client Owner'));
    }

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
    const company=await one('SELECT entity_type,company_number,name,address FROM landlords_bdm WHERE id=$1',[created.data.enquiry_id]);assert.equal(company.entity_type,'company');assert.equal(company.company_number,'12345678');assert.equal(company.name,'Example Ltd');assert.match(company.address,/30 Test Road/);
    const url=`/api/public/landlord-enquiries/${created.data.enquiry_id}/documents`;
    const body=new FormData();body.append('documents',new Blob([pdf],{type:'application/pdf'}),'Ownership.pdf');body.append('doc_type','Proof of Ownership');
    assert.equal((await fetch(`http://127.0.0.1:${port}`+url,{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${passed+1}`},body})).status,403);
    const response=await fetch(`http://127.0.0.1:${port}`+url+'?token='+created.data.upload_token,{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${passed+1}`},body});assert.equal(response.status,200,await response.text());
    const docs=await ok(`/api/documents/landlord_bdm/${created.data.enquiry_id}`,{token:auth.staff});assert(docs.some(d=>d.doc_type==='Proof of Ownership'&&d.review_status==='pending'));
    assert.equal((await one('SELECT intake_data FROM landlords_bdm WHERE id=$1',[created.data.enquiry_id])).intake_data.beneficial_owners,'Owner Test 100%');
  });

  await test('administrator note deletion is atomic and staff cannot bypass it through full-record updates',async()=>{
    const note={id:'keep',text:'Office note',author:'Test',created_at:'2026-01-01'};
    await sql('UPDATE tenants SET notes=$1 WHERE id=$2',[JSON.stringify([note]),reviewTenant.id]);
    assert.equal((await request(`/api/record-notes/tenant/${reviewTenant.id}/delete`,{method:'POST',token:auth.staff,body:{note_id:note.id,text:note.text}})).status,403);
    assert.equal((await request(`/api/tenants/${reviewTenant.id}/notes`,{method:'PATCH',token:auth.staff,body:{notes:'[]'}})).status,403);
    assert.equal((await request(`/api/tenants/${reviewTenant.id}`,{method:'PUT',token:auth.staff,body:{notes:'[]'}})).status,403);
    await ok(`/api/record-notes/tenant/${reviewTenant.id}/delete`,{method:'POST',token:auth.admin,body:{note_id:note.id,text:note.text}});
    assert.deepEqual(JSON.parse((await one('SELECT notes FROM tenants WHERE id=$1',[reviewTenant.id])).notes),[]);
    assert.equal((await request(`/api/record-notes/tenant/${reviewTenant.id}/delete`,{method:'POST',token:auth.admin,body:{note_id:note.id,text:note.text}})).status,409);
  });
  await test('signed inventories require dates, link Documents, reject duplicate uploads and protect staff edits',async()=>{
    const upload=async(extra={},token=auth.staff)=>{const f=new FormData();f.append('file',new Blob([pdf],{type:'application/pdf'}),'Signed Inventory.pdf');f.append('tenant_id',String(reviewTenant.id));f.append('inspection_date',today);for(const [k,v] of Object.entries(extra))f.append(k,v);const res=await fetch(base+`/api/properties/${reviewProperty.id}/inventory-document`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:f});return {status:res.status,data:await res.json()};};
    assert.equal((await upload()).status,400);
    const saved=await upload({signed_date:today});assert.equal(saved.status,200,JSON.stringify(saved));
    assert.equal((await upload({signed_date:today})).status,409);
    assert.equal((await request(`/api/inventories/${saved.data.id}`,{method:'DELETE',token:auth.staff})).status,403);
    const docs=await sql('SELECT * FROM documents WHERE inventory_id=$1',[saved.data.id]);assert(docs.some(d=>d.entity_type==='property'));assert(docs.some(d=>d.entity_type==='tenant'));
    assert.equal((await request(`/api/documents/${docs[0].id}`,{method:'DELETE',token:auth.staff})).status,409);
    assert.equal((await upload({signed_date:today,inventory_id:String(saved.data.id)},auth.admin)).status,200);
    await ok(`/api/inventories/${saved.data.id}`,{method:'DELETE',token:auth.admin});assert.equal((await sql('SELECT id FROM documents WHERE inventory_id=$1',[saved.data.id])).length,0);
  });
  await test('identical document retries return one stored record without changing its category',async()=>{
    const upload=async(name)=>{const body=new FormData();body.append('file',new Blob([pdf],{type:'application/pdf'}),name);body.append('doc_type','Other');const r=await fetch(base+`/api/documents/tenant/${reviewTenant.id}`,{method:'POST',headers:{Authorization:`Bearer ${auth.staff}`},body});assert.equal(r.status,200);return r.json();};
    const first=await upload('Evidence A.pdf'),again=await upload('Evidence B.pdf');assert.equal(first.id,again.id);assert.equal(again.duplicate,true);
  });
  await test('tenancy activation rotates address history exactly once',async()=>{
    const p=await one("INSERT INTO properties(address,postcode,landlord_id,status) VALUES('21A New Street','WV1 2AB',$1,'let_agreed') RETURNING id",[landlord.id]);
    const t=await one("INSERT INTO tenants(first_name_1,last_name_1,name,property_id,status,tenancy_start_date,current_address,previous_address) VALUES('Moving','Test','Moving Test',$1,'scheduled',CURRENT_DATE,'26 Old Street','Earlier Home') RETURNING id",[p.id]);
    await ok('/api/tenants',{token:auth.admin});
    const first=await one('SELECT status,current_address,previous_address,address_before_previous FROM tenants WHERE id=$1',[t.id]);
    assert.deepEqual(first,{status:'active',current_address:'21A New Street, WV1 2AB',previous_address:'26 Old Street',address_before_previous:'Earlier Home'});
    await ok('/api/tenants',{token:auth.admin});assert.deepEqual(await one('SELECT status,current_address,previous_address,address_before_previous FROM tenants WHERE id=$1',[t.id]),first);
  });
  await test('all three compliance documents and date changes update property readiness',async()=>{
    let detail=await ok(`/api/properties/${property.id}`,{token:auth.staff});
    assert(detail.compliance.items.find(i=>i.docType==='EPC').ready);
    await ok(`/api/properties/${property.id}`,{method:'PUT',token:auth.staff,body:{has_gas:true,gas_safety_commissioned_date:'2026-01-01',gas_safety_expiry_date:'2030-01-01'}});
    detail=await ok(`/api/properties/${property.id}`,{token:auth.staff});assert.equal(detail.compliance.items.length,3);assert.equal(detail.compliance.ready,false);
    await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('property',$1,'Gas Safety Certificate','sample.pdf','Gas.pdf','application/pdf','approved')",[property.id]);
    detail=await ok(`/api/properties/${property.id}`,{token:auth.staff});assert.equal(detail.compliance.ready,true);assert.equal(detail.gas_safety_commissioned_date,'2026-01-01');
    for(const key of ['epc_expiry_date','eicr_expiry_date','gas_safety_expiry_date']){await ok(`/api/properties/${property.id}`,{method:'PUT',token:auth.staff,body:{[key]:'2020-01-01'}});assert.equal((await ok(`/api/properties/${property.id}`,{token:auth.staff})).compliance.ready,false);await ok(`/api/properties/${property.id}`,{method:'PUT',token:auth.staff,body:{[key]:'2030-01-01'}});}
  });
  await test('portfolio insurance allocates once and rejects individual edits, invalid dates and viewer writes',async()=>{
    const payload={policy_type:'buildings',annual_cost:100,commencement_date:today,expiry_date:'2030-01-01',property_ids:[property.id,reviewProperty.id],policy_number:'TEST-123'};
    assert.equal((await request(`/api/properties/${property.id}/policies`,{method:'POST',token:auth.viewer,body:payload})).status,403);
    assert.equal((await request(`/api/properties/${property.id}/policies`,{method:'POST',token:auth.staff,body:{...payload,expiry_date:'2026-02-31'}})).status,400);
    const saved=await request(`/api/properties/${property.id}/policies`,{method:'POST',token:auth.staff,body:payload});assert.equal(saved.status,201,JSON.stringify(saved));
    const costs=await sql('SELECT id,amount FROM property_expenses WHERE policy_id=$1',[saved.data.id]);assert.equal(costs.length,2);assert.equal(costs.reduce((sum,c)=>sum+Number(c.amount),0),100);
    for(const method of ['PUT','DELETE'])assert.equal((await request(`/api/property-expenses/${costs[0].id}`,{method,token:auth.staff,body:method==='PUT'?{amount:400}:undefined})).status,409);
    const coverage=await request('/api/property-expenses',{method:'POST',token:auth.staff,body:{property_id:property.id,description:'Ground Rent',amount:150,coverage_start:'2026-06-24',coverage_end:'2027-06-23',is_recurring:true,recurrence_frequency:'six_monthly'}});assert.equal(coverage.status,200);
    await ok(`/api/property-expenses/${coverage.data.id}`,{method:'PUT',token:auth.staff,body:{is_estimate:true}});
    assert.equal((await one('SELECT is_estimate FROM property_expenses WHERE id=$1',[coverage.data.id])).is_estimate,true);
    assert.equal((await request(`/api/property-expenses/${coverage.data.id}`,{method:'PUT',token:auth.staff,body:{is_estimate:'yes'}})).status,400);
    assert.equal((await request('/api/property-expenses',{method:'POST',token:auth.staff,body:{property_id:property.id,description:'Invalid',amount:1,coverage_start:'2027-01-01',coverage_end:'2026-01-01'}})).status,400);
  });
  await test('appearance persists only for the current user; login history and encoded-page activity work',async()=>{
    const appearance={font:'verdana',scale:125,background:'cream'};
    await ok('/api/auth/profile',{method:'PUT',token:auth.staff,body:{accent_color:'#a32372',appearance}});
    assert.deepEqual((await one("SELECT appearance FROM users WHERE email='staff@example.test'")).appearance,appearance);
    assert.deepEqual((await one("SELECT appearance FROM users WHERE email='admin@example.test'")).appearance,{});
    assert.equal((await request('/api/auth/profile',{method:'PUT',token:auth.staff,body:{accent_color:'#a32372',appearance:{...appearance,scale:999}}})).status,400);
    assert((await ok('/api/auth/login-history',{token:auth.staff})).length>0);
    await ok('/api/activity/heartbeat',{method:'POST',token:auth.staff,body:{page:'/tenants/12-tara-o%E2%80%99hanlon',navigation:true}});
  });
  await test('Flemo email proposals are user-bound, one-use and cannot claim a failed send succeeded',async()=>{
    const id='de69da40-d21a-45d8-942c-575e5e6bd246';const u=await one("SELECT id FROM users WHERE email='admin@example.test'");
    await sql('INSERT INTO ai_action_requests(id,user_id,payload) VALUES($1,$2,$3)',[id,u.id,JSON.stringify({to:'recipient@example.test',subject:'Test report',text:'Test content',document_ids:[]})]);
    const body={payload:{request_id:id,to:'forged@example.test'}};
    assert.equal((await request('/api/ai/execute',{method:'POST',token:auth.viewer,body})).status,403);
    assert.equal((await request('/api/ai/execute',{method:'POST',token:auth.staff,body})).status,409);
    assert.equal((await request('/api/ai/execute',{method:'POST',token:auth.admin,body})).status,502);
    const saved=await one("SELECT to_email,status FROM email_messages WHERE template='flemo_report' ORDER BY id DESC LIMIT 1");assert.equal(saved.to_email,'recipient@example.test');assert.equal(saved.status,'failed');
    assert.equal((await request('/api/ai/execute',{method:'POST',token:auth.admin,body})).status,409);
  });
  await test('signed PDFs over 25 MB support undated signatures and one shared joint-tenancy inventory',async()=>{
    const t=await one('SELECT tenancy_start_date FROM tenants WHERE id=$1',[reviewTenant.id]);
    const partner=await one("INSERT INTO tenants(first_name_1,last_name_1,name,property_id,tenancy_start_date,linked_tenant_id) VALUES('Inventory','Joint Test','Inventory Joint Test',$1,$2,$3) RETURNING id",[reviewProperty.id,t.tenancy_start_date,reviewTenant.id]);
    await sql('UPDATE tenants SET linked_tenant_id=$1 WHERE id=$2',[partner.id,reviewTenant.id]);
    const large=Buffer.concat([pdf,Buffer.alloc(26*1024*1024,32)]);
    writeFileSync(path.join(dir,'legacy-inventory.pdf'),large);
    const legacy=await one("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size) VALUES('property',$1,'Inventory','legacy-inventory.pdf','Old Inventory.pdf','application/pdf',$2) RETURNING id",[reviewProperty.id,large.length]);
    const upload=async(id,file)=>{const f=new FormData();f.append('file',new Blob([file],{type:'application/pdf'}),'Large signed inventory.pdf');f.append('tenant_id',String(id));f.append('inspection_date',today);f.append('signature_date_unknown','true');const r=await fetch(base+`/api/properties/${reviewProperty.id}/inventory-document`,{method:'POST',headers:{Authorization:`Bearer ${auth.staff}`},body:f});return {status:r.status,data:await r.json()};};
    const saved=await upload(reviewTenant.id,large);assert.equal(saved.status,200,JSON.stringify(saved));
    assert.equal((await one('SELECT inventory_id FROM documents WHERE id=$1',[legacy.id])).inventory_id,saved.data.id);
    const row=await one('SELECT signed_document,signed_date FROM inventories WHERE id=$1',[saved.data.id]);assert.equal(row.signed_document,true);assert.equal(row.signed_date,null);
    assert.equal((await upload(partner.id,pdf)).status,409);
    const links=await sql("SELECT entity_id FROM documents WHERE inventory_id=$1 AND entity_type='tenant'",[saved.data.id]);assert.deepEqual(links.map(l=>l.entity_id).sort((a,b)=>a-b),[reviewTenant.id,partner.id].sort((a,b)=>a-b));
    assert.equal((await request(`/api/inventories/${saved.data.id}`,{method:'DELETE',token:auth.staff})).status,403);
  });
  await test('public drafts cannot override agreed rent/deposit and record last saved time',async()=>{
    const row=await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,status,linked_property_id,application_form_token,monthly_rent_agreed,security_deposit_amount) VALUES('Draft','Test','draft@example.test','onboarding',$1,'locked-finances-test',1200,1300) RETURNING id",[property.id]);
    await ok('/api/public/application-form/locked-finances-test/draft',{method:'POST',body:{app_form_data:{rental_amount:'1',deposit_amount:'2',employment_status:'Retired'}}});
    const saved=await one('SELECT app_form_data,application_form_last_saved_at FROM tenant_enquiries WHERE id=$1',[row.id]);assert.equal(Number(saved.app_form_data.rental_amount),1200);assert.equal(Number(saved.app_form_data.deposit_amount),1300);assert(saved.application_form_last_saved_at);
  });
  await test('maintenance deep links retain portfolio, assignment, dates and property audit',async()=>{
    const member=await one("SELECT id FROM users WHERE role='staff'");
    const created=await ok('/api/maintenance',{method:'POST',token:auth.staff,body:{property_id:property.id,title:'Afternoon leak',description:'Test repair',assigned_to:member.id,follow_up_date:'2026-10-01',due_date:'2026-10-05'}});
    const item=await ok(`/api/maintenance/${created.id}`,{token:auth.staff});assert.equal(item.landlord_type,'internal');assert.equal(item.assigned_name,'Test staff');assert.match(item.due_date,/2026-10-05/);
    const timeline=await ok(`/api/activity/property/${property.id}`,{token:auth.staff});assert(timeline.some(a=>a.entity_type==='maintenance'&&a.entity_id===created.id&&a.action==='create'));
    await ok(`/api/maintenance/${created.id}`,{method:'PUT',token:auth.staff,body:{assigned_to:null,status:'completed'}});
    const task=await one("SELECT * FROM tasks WHERE entity_type='maintenance' AND entity_id=$1",[created.id]);assert.equal(task.status,'completed');assert.equal(task.assigned_to,null);
    assert.equal((await request(`/api/maintenance/${created.id}`,{method:'PUT',token:auth.staff,body:{due_date:'2026-02-31'}})).status,400);
  });
  await test('received holding deposits reject repeat payment requests before sending',async()=>{
    const e=await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,holding_deposit_received) VALUES('Paid','Test','paid@example.test',1) RETURNING id");
    const before=await one('SELECT count(*)::int n FROM email_messages');
    assert.equal((await request(`/api/tenant-enquiries/${e.id}/request-holding-deposit`,{method:'POST',token:auth.staff,body:{monthly_rent:1000,holding_deposit:200}})).status,409);
    assert.equal((await one('SELECT count(*)::int n FROM email_messages')).n,before.n);
  });
  await test('answer reviews require explicit decisions and rejection reasons; email previews render HTML',async()=>{
    const e=await one(`INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,application_form_completed,app_form_data) VALUES('Review','Test','review@example.test',1,'{"first_name":"Review","bank_name":"Example"}') RETURNING id`);
    const section=(body,token=auth.staff)=>request(`/api/tenant-enquiries/${e.id}/section-review`,{method:'PUT',token,body});
    assert.equal((await section({section:'Personal Details',status:'rejected'})).status,400);
    assert.equal((await section({section:'Personal Details',status:'approved'},auth.viewer)).status,403);
    assert.equal((await section({section:'Personal Details',status:'rejected',reason:'Please correct the name'})).status,200);
    let row=await one('SELECT * FROM tenant_enquiries WHERE id=$1',[e.id]);assert.equal(row.application_section_reviews['Personal Details'].status,'rejected');assert.equal(row.application_changes_sent_at,null);
    const preview=await ok(`/api/tenant-enquiries/${e.id}/application-review/email-preview`,{method:'POST',token:auth.staff,body:{changes_required:'Personal Details: Correct <name>'}});assert(preview.html.length>1000);assert.match(preview.html,/Correct &lt;name&gt;/);
    for(const type of ['Primary Identification','Secondary Identification','Bank Statements','Proof of Income or Employment'])await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,review_status) VALUES('tenant_enquiry',$1,$2,'sample.pdf','review.pdf','approved')",[e.id,type]);
    assert.equal((await request(`/api/tenant-enquiries/${e.id}/application-review`,{method:'POST',token:auth.staff,body:{status:'approved'}})).status,409);
    for(const name of ['Personal Details','Bank Details'])assert.equal((await section({section:name,status:'approved'})).status,200);
    await ok(`/api/tenant-enquiries/${e.id}/application-review`,{method:'POST',token:auth.staff,body:{status:'approved'}});
    row=await one('SELECT * FROM tenant_enquiries WHERE id=$1',[e.id]);assert.equal(row.application_review_status,'approved');
    const holding=await ok(`/api/tenant-enquiries/${e.id}/holding-deposit/email-preview`,{method:'POST',token:auth.staff,body:{monthly_rent:1000,holding_deposit:200}});assert(holding.html.length>1000);assert.match(holding.html,/Holding deposit request/);
  });
  await test('one answer decision locks public drafts and submissions while allowing document review',async()=>{
    const data={first_name:'Approved',last_name:'Applicant',date_of_birth:'1990-01-01',rental_amount:1000,deposit_amount:1000,marketing_consent:false};
    const e=await one(`INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,status,application_form_token,application_form_completed,app_form_data,monthly_rent_agreed,security_deposit_amount) VALUES('Approved','Applicant','approved@example.test','onboarding','approved-answers-test',1,$1,1000,1000) RETURNING id`,[JSON.stringify(data)]);
    const decide=body=>ok(`/api/tenant-enquiries/${e.id}/section-review`,{method:'PUT',token:auth.staff,body:{section:'Application Details',...body}});
    await decide({status:'approved'});
    const publicForm=await ok('/api/public/application-form/approved-answers-test');assert.equal(publicForm.application_data_approved,true);assert(!JSON.stringify(publicForm.application_section_reviews).includes('reviewed_by'));
    await ok('/api/public/application-form/approved-answers-test/draft',{method:'POST',body:{app_form_data:data}});
    for(const route of ['/draft',''])assert.equal((await request('/api/public/application-form/approved-answers-test'+route,{method:'POST',body:{app_form_data:{...data,date_of_birth:'2000-01-01'}}})).status,409);
    assert.equal((await request('/api/public/application-form/approved-answers-test/draft',{method:'POST',body:{app_form_data:{...data,marketing_consent:'false'}}})).status,409);
    assert.deepEqual((await one('SELECT app_form_data FROM tenant_enquiries WHERE id=$1',[e.id])).app_form_data,data);
    await decide({status:'rejected',reason:'Correct your date of birth'});
    assert.equal((await ok('/api/public/application-form/approved-answers-test')).application_data_approved,false);
    await ok('/api/public/application-form/approved-answers-test/draft',{method:'POST',body:{app_form_data:{...data,date_of_birth:'1991-01-01'}}});
    assert.equal((await one('SELECT app_form_data FROM tenant_enquiries WHERE id=$1',[e.id])).app_form_data.date_of_birth,'1991-01-01');
  });
  await test('document-only revisions preserve approved answers, review attribution and the original signature',async()=>{
    const data={"first_name": "Browser", "last_name": "Review", "email": "alex@example.test", "phone": "07700900123", "date_of_birth": "1990-08-20", "ni_number": "QQ 12 34 56 C", "current_address_line_1": "1 High Street", "current_address_city": "Wolverhampton", "current_address_postcode": "WV1 1AA", "years_at_current_address": "0", "residency_status": "Lodger", "marital_status": "Single", "gross_annual_income": "30000", "employment_status": "Unemployed", "bank_account_name": "Alex Smith", "bank_sort_code": "11-12-14", "bank_account_number": "01234567", "property_address": "2 High Street", "preferred_start_date": "2026-09-21", "rental_period": "Monthly", "tenancy_duration": "12 months", "rental_amount": 1000, "deposit_amount": 1200, "next_of_kin_name": "Sam Smith", "next_of_kin_address": "3 High Street", "next_of_kin_postcode": "WV1 1AA", "next_of_kin_phone": "07700900124", "next_of_kin_email": "kin@example.com", "next_of_kin_relationship": "Sibling", "legal_proceedings": "No", "has_joint_applicants": false, "has_employer_reference": false, "has_landlord_reference": false, "has_personal_reference": false, "has_additional_income": false, "has_loans": false, "has_credit_cards": false, "has_other_occupants": false, "has_pets": false, "deposit_contributor": false, "has_guarantor": false, "declaration_holding_deposit": true, "declaration_info_accurate": true, "declaration_privacy": true, "declaration_enquiries": true, "declaration_documents": true, "declaration_credit_check": true, "declaration_terms": true};
    const e=await one(`INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1,status,application_form_token,application_form_completed,application_review_status,app_form_data,app_signature,app_signature_name,app_signature_ip,app_signed_at,monthly_rent_agreed,security_deposit_amount) VALUES('Browser','Review','revision@example.test','onboarding','document-only-revision',1,'approved',$1,$2,'Original Signer','192.0.2.55',NOW(),1000,1200) RETURNING id`,[JSON.stringify(data),png]);
    let primary;
    for(const type of ['Primary Identification','Secondary Identification','Bank Statements']){
      const d=await one("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,review_status) VALUES('tenant_enquiry',$1,$2,'sample.pdf',$3,'application/pdf','approved') RETURNING id",[e.id,type,type+'.pdf']);if(type==='Primary Identification')primary=d.id;
    }
    await ok(`/api/documents/${primary}/review`,{method:'PUT',token:auth.staff,body:{status:'rejected',notes:'Provide a clearer copy'}});
    assert.equal((await ok('/api/public/application-form/document-only-revision')).application_data_approved,true);
    const before=await one('SELECT app_signature,app_signature_name,app_signature_ip,app_signed_at,application_section_reviews FROM tenant_enquiries WHERE id=$1',[e.id]);
    const body=new FormData();body.append('file',new Blob([pdf],{type:'application/pdf'}),'Clear passport.pdf');body.append('doc_type','Primary Identification');
    const uploaded=await fetch(base+'/api/public/application-form/document-only-revision/documents',{method:'POST',body});assert.equal(uploaded.status,200,await uploaded.text());
    assert.equal((await ok('/api/public/application-form/document-only-revision')).application_data_approved,true);
    await ok('/api/public/application-form/document-only-revision',{method:'POST',body:{app_form_data:data,app_signature_name:'Attempted change'}});
    const after=await one('SELECT app_form_data,app_signature,app_signature_name,app_signature_ip,app_signed_at,application_section_reviews FROM tenant_enquiries WHERE id=$1',[e.id]);
    assert.deepEqual(after.app_form_data,data);delete after.app_form_data;assert.deepEqual(after,before);
    assert.equal((await ok('/api/public/application-form/document-only-revision')).application_data_approved,true);
  });
  await test('marketing enforces channel permission, deduplicates contacts, queues once and honours opt-out',async()=>{
    const l=await one("INSERT INTO landlords(name,email,phone) VALUES('=Formula Test','marketing@example.test','07700900099') RETURNING id");
    const e=await one("INSERT INTO tenant_enquiries(first_name_1,last_name_1,email_1) VALUES('Same inbox','Test','MARKETING@example.test') RETURNING id");
    assert.equal((await request('/api/marketing/contacts',{token:auth.staff})).status,403);
    const contacts=await ok('/api/marketing/contacts',{token:auth.admin});assert(contacts.some(c=>c.id===l.id&&c.entity_type==='landlord'));
    const body={channel:'email',subject:'Test',message:'<h1>Local test</h1><script>alert(1)</script>',message_format:'html',recipients:[`landlord:${l.id}`,`tenant_enquiry:${e.id}`]};
    assert.equal((await request('/api/marketing/campaigns',{method:'POST',token:auth.admin,body})).status,409);
    await ok('/api/marketing/permission',{method:'PUT',token:auth.admin,body:{channel:'email',destination:'marketing@example.test',allowed:true,evidence:'Explicit email consent in local test'}});
    const made=await request('/api/marketing/campaigns',{method:'POST',token:auth.admin,body});assert.equal(made.status,201);assert.equal(made.data.count,1);
    const [s1,s2]=await Promise.all([1,2].map(()=>request(`/api/marketing/campaigns/${made.data.id}/send`,{method:'POST',token:auth.admin,body:{}})));assert.deepEqual([s1.status,s2.status].sort(),[202,409]);
    for(let i=0;i<40;i++){const rows=await sql('SELECT status FROM marketing_recipients WHERE campaign_id=$1',[made.data.id]);if(rows.every(r=>!['pending','sending'].includes(r.status)))break;await new Promise(r=>setTimeout(r,100));}
    const recipient=await one('SELECT * FROM marketing_recipients WHERE campaign_id=$1',[made.data.id]);assert.equal(recipient.status,'failed');
    const copies=await sql("SELECT entity_type,entity_id,body_html FROM email_messages WHERE template='marketing' AND to_email='marketing@example.test'");assert.equal(copies.length,2);assert(copies.every(m=>m.body_html.includes('<h1>Local test</h1>')&&!m.body_html.includes('<script')));
    const permission=await one("SELECT * FROM marketing_permissions WHERE destination='marketing@example.test'");
    assert.equal((await request(`/api/public/marketing/unsubscribe/${permission.unsubscribe_token}`)).status,200);assert((await one('SELECT allowed FROM marketing_permissions WHERE unsubscribe_token=$1',[permission.unsubscribe_token])).allowed);
    assert.equal((await request(`/api/public/marketing/unsubscribe/${permission.unsubscribe_token}`,{method:'POST'})).status,200);
    assert.equal((await request('/api/marketing/campaigns',{method:'POST',token:auth.admin,body})).status,409);
    const exported=await request('/api/marketing/export',{token:auth.admin});assert.equal(exported.status,200);assert.match(exported.data,/'=Formula Test/);
  });
  await test('bank allocations replace assumptions, split deposits, reject duplicate posting and roll back invalid splits',async()=>{
    const connection=await one("INSERT INTO bank_feed_connections(provider,status) VALUES('freeagent','connected') RETURNING id");
    const charge=await one("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,opening_balance_amount,status) VALUES($1,$2,'2026-09-21',800,800,800,'paid') RETURNING id",[property.id,tenantId]);
    const bank=await one("INSERT INTO bank_feed_transactions(connection_id,external_id,account_id,booked_at,amount) VALUES($1,'split-test','test',NOW(),1600) RETURNING id",[connection.id]);
    const body={action:'assign',allocations:[{kind:'rent',rent_payment_id:charge.id,amount:800},{kind:'deposit',tenant_id:tenantId,amount:800}]};
    const [first,second]=await Promise.all([1,2].map(()=>request(`/api/bank-feed/transactions/${bank.id}/reconcile`,{method:'POST',token:auth.staff,body})));
    assert.deepEqual([first.status,second.status].sort(),[200,400]);
    const paid=await one('SELECT * FROM rent_payments WHERE id=$1',[charge.id]);assert.equal(Number(paid.amount_paid),800);assert.equal(Number(paid.opening_balance_amount),0);
    assert.equal((await sql('SELECT * FROM bank_feed_allocations WHERE bank_transaction_id=$1',[bank.id])).length,2);
    assert.equal((await request(`/api/rent-payments/${charge.id}/pay`,{method:'PUT',token:auth.staff,body:{amount_paid:0}})).status,409);
    assert.equal((await request(`/api/rent-payments/${charge.id}`,{method:'PUT',token:auth.staff,body:{amount_due:1}})).status,409);
    assert.equal((await request(`/api/rent-payments/${charge.id}`,{method:'DELETE',token:auth.admin})).status,409);
    const totals=(await ok('/api/bank-feed/status',{token:auth.staff})).totals;assert.equal(totals.rent_matches,1);assert.equal(totals.deposit_matches,1);
    const extra=await one("INSERT INTO bank_feed_transactions(connection_id,external_id,account_id,booked_at,amount) VALUES($1,'bad-split-test','test',NOW(),100) RETURNING id",[connection.id]);
    const failed=await request(`/api/bank-feed/transactions/${extra.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'assign',allocations:[{kind:'deposit',tenant_id:tenantId,amount:50},{kind:'rent',rent_payment_id:99999999,amount:50}]}});assert.equal(failed.status,400);
    assert.equal((await sql('SELECT * FROM bank_feed_allocations WHERE bank_transaction_id=$1',[extra.id])).length,0);
    await ok(`/api/bank-feed/transactions/${extra.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'ignore'}});
    await ok(`/api/bank-feed/transactions/${extra.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'restore'}});
    assert.equal((await one('SELECT match_status FROM bank_feed_transactions WHERE id=$1',[extra.id])).match_status,'unmatched');
    await ok(`/api/bank-feed/transactions/${bank.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'unassign'}});
    assert.equal(Number((await one('SELECT opening_balance_amount FROM rent_payments WHERE id=$1',[charge.id])).opening_balance_amount),800);
    const over=await one("INSERT INTO bank_feed_transactions(connection_id,external_id,account_id,booked_at,amount) VALUES($1,'overpay-test','test',NOW(),820) RETURNING id",[connection.id]);
    await ok(`/api/bank-feed/transactions/${over.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'assign',allocations:[{kind:'rent',rent_payment_id:charge.id,amount:820}]}});
    assert.equal(Number((await one('SELECT amount_paid FROM rent_payments WHERE id=$1',[charge.id])).amount_paid),820);
    await ok(`/api/bank-feed/transactions/${over.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'unassign'}});
    await ok(`/api/bank-feed/transactions/${extra.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'assign',allocations:[{kind:'rent',rent_payment_id:charge.id,amount:100}]}});
    const under=await one('SELECT amount_paid,status FROM rent_payments WHERE id=$1',[charge.id]);assert.equal(Number(under.amount_paid),100);assert.equal(under.status,'partial');
    await ok(`/api/bank-feed/transactions/${extra.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'unassign'}});
    await ok(`/api/bank-feed/transactions/${extra.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'assign',allocations:[{kind:'income',category:'Interest Received',notes:'Office interest',amount:100}]}});
    assert.equal((await one('SELECT property_id FROM bank_feed_allocations WHERE bank_transaction_id=$1 AND reversed_at IS NULL',[extra.id])).property_id,null);

  });
  await test('landlord property creation accepts the card form and KYC needs only primary ID',async()=>{
    const owner=await one("INSERT INTO landlords(name,landlord_type,address,home_address) VALUES('Card Owner','external','1 Home Road, Test Town, WV1 1AA','1 Home Road, Test Town, WV1 1AA') RETURNING id");
    const created=await request('/api/properties',{method:'POST',token:auth.staff,body:{address:'2 Card Road, Test Town, WV1 1AB',city:'Test Town',postcode:'WV1 1AB',landlord_id:owner.id,type:'flat',status:'to_let',service_type:'rent_collection',has_gas:false,has_management_company:false,is_leasehold:false}});
    assert.equal(created.status,200,JSON.stringify(created.data));
    const records=await ok(`/api/landlords/${owner.id}/properties`,{token:auth.staff});assert(records.some(p=>p.city==='Test Town'&&p.postcode==='WV1 1AB'));
    assert.equal((await request(`/api/landlords/${owner.id}`,{method:'PUT',token:auth.admin,body:{kyc_completed:1}})).status,409);
    await sql("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,review_status) VALUES('landlord',$1,'Primary Identification','sample.pdf','ID.pdf','approved')",[owner.id]);
    await ok(`/api/landlords/${owner.id}`,{method:'PUT',token:auth.admin,body:{kyc_completed:1}});
  });
  await test('daily rent charging deduplicates joint tenants and never sends automatic reminders',async()=>{
    await sql("UPDATE bank_feed_connections SET status='error'");
    await sql("UPDATE rent_tracking_settings SET cutover_date='2026-09-21',chasers_enabled=TRUE WHERE id=1");
    const first=await one("INSERT INTO tenants(name,first_name_1,last_name_1,status,property_id,monthly_rent,tenancy_start_date,email) VALUES('Scheduler A','Scheduler','A','active',$1,800,'2026-09-21','schedule@example.test') RETURNING id",[property.id]);
    const second=await one("INSERT INTO tenants(name,first_name_1,last_name_1,status,property_id,monthly_rent,tenancy_start_date,linked_tenant_id) VALUES('Scheduler B','Scheduler','B','active',$1,800,'2026-09-21',$2) RETURNING id",[property.id,first.id]);
    await sql('UPDATE tenants SET linked_tenant_id=$1 WHERE id=$2',[second.id,first.id]);
    const script="const s=require('./dist/finance-scheduler'),db=require('./dist/db-pg');(async()=>{await s.runFinanceSchedule(new Date('2026-10-22T10:00:00Z'));await s.runFinanceSchedule(new Date('2026-10-22T10:00:00Z'));await db.default.end()})().catch(e=>{console.error(e);process.exit(1)})";
    const run=spawnSync(process.execPath,['-e',script],{env,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
    const charges=await sql('SELECT id,due_date::text,amount_paid FROM rent_payments WHERE tenant_id=ANY($1::int[])',[[first.id,second.id]]);assert.equal(charges.length,1);assert.equal(new Date(charges[0].due_date).toISOString().slice(0,10),'2026-10-21');assert.equal(Number(charges[0].amount_paid),0);
    assert.equal((await one('SELECT count(*)::int n FROM rent_chaser_deliveries')).n,0);
    await sql("UPDATE bank_feed_connections SET status='connected',last_synced_at='2026-10-22T09:00:00Z'");
    const waiting=spawnSync(process.execPath,['-e',script],{env,encoding:'utf8'});assert.equal(waiting.status,0,waiting.stderr);
    assert.equal((await one('SELECT count(*)::int n FROM rent_chaser_deliveries')).n,0);
    await sql("UPDATE bank_feed_transactions SET match_status='ignored' WHERE match_status='unmatched'");
    const sending=spawnSync(process.execPath,['-e',script],{env,encoding:'utf8'});assert.equal(sending.status,0,sending.stderr);
    const deliveries=await sql('SELECT * FROM rent_chaser_deliveries WHERE rent_payment_id=$1',[charges[0].id]);assert.equal(deliveries.length,0);
  });
  await test('linked historical inventories download from their existing storage location without duplicate files',async()=>{
    const inventory=await one("INSERT INTO inventories(property_id,tenant_id,inventory_type,inspection_date,status) VALUES($1,$2,'check_in',CURRENT_DATE-30,'in_progress') RETURNING id",[reviewProperty.id,reviewTenant.id]);
    const pdf=Buffer.from('%PDF-1.4 historical inventory fixture');
    writeFileSync(path.join(dir,'historic-original.pdf'),pdf);
    const document=await one("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,inventory_id) VALUES('property',$1,'Inventory','historic-original.pdf','Historical inventory.pdf','application/pdf',$2,$3) RETURNING id",[reviewProperty.id,pdf.length,inventory.id]);
    const token='e'.repeat(64);
    await sql("INSERT INTO inventory_reviews(inventory_id,tenant_id,token,tenant_name,due_date,expires_at) VALUES($1,$2,$3,'Historical tenant',CURRENT_DATE+7,NOW()+INTERVAL '7 days')",[inventory.id,reviewTenant.id,token]);
    const routes=[`/api/inventories/${inventory.id}/document`,`/api/public/inventory/${token}/document`];
    for(const route of routes){const response=await fetch(base+route,{headers:{Authorization:`Bearer ${auth.staff}`}});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);}
    assert.equal((await fetch(base+routes[0])).status,401);
    await sql('UPDATE documents SET filename=$1 WHERE id=$2',['../outside.pdf',document.id]);
    for(const route of routes)assert.equal((await fetch(base+route,{headers:{Authorization:`Bearer ${auth.staff}`}})).status,404);
    await sql('UPDATE documents SET filename=$1 WHERE id=$2',['missing.pdf',document.id]);
    assert.equal((await fetch(base+routes[0],{headers:{Authorization:`Bearer ${auth.staff}`}})).status,404);
  });
  await test('inventory reminders reset for a new tenant, escalate at seven days and close only on signed evidence',async()=>{
    const p=await one("INSERT INTO properties(address,postcode,landlord_id) VALUES('Inventory reset test','WV1 1AA',$1) RETURNING id",[landlord.id]);
    const old=await one("INSERT INTO tenants(name,first_name_1,last_name_1,status,property_id,tenancy_start_date) VALUES('Previous tenant','Previous','tenant','inactive',$1,CURRENT_DATE-30) RETURNING id",[p.id]);
    await sql("INSERT INTO inventories(property_id,tenant_id,inventory_type,inspection_date,signed_date,status) VALUES($1,$2,'check_in',CURRENT_DATE-30,CURRENT_DATE-29,'completed')",[p.id,old.id]);
    const current=await one("INSERT INTO tenants(name,first_name_1,last_name_1,status,property_id,tenancy_start_date) VALUES('New tenant','New','tenant','active',$1,CURRENT_DATE-7) RETURNING id",[p.id]);
    await sql("INSERT INTO inventories(property_id,tenant_id,inventory_type,inspection_date,signed_date,status) VALUES($1,$2,'check_in',CURRENT_DATE-100,CURRENT_DATE-99,'completed')",[p.id,current.id]);
    const script="const db=require('./dist/db-pg');require('./dist/tenant-lifecycle-db').syncTenantLifecycle().then(()=>db.default.end()).catch(e=>{console.error(e);process.exit(1)})";
    const run=()=>{const result=spawnSync(process.execPath,['-e',script],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};run();run();
    let tasks=await sql("SELECT * FROM tasks WHERE task_type='inventory_due' AND entity_id=$1",[current.id]);assert.equal(tasks.length,1);assert.equal(tasks[0].priority,'high');assert.equal(tasks[0].status,'pending');
    const draft=await one("INSERT INTO inventories(property_id,tenant_id,inventory_type,inspection_date,status) VALUES($1,$2,'check_in',CURRENT_DATE,'in_progress') RETURNING id",[p.id,current.id]);run();assert.equal((await one('SELECT status FROM tasks WHERE id=$1',[tasks[0].id])).status,'pending');
    await sql("UPDATE inventories SET signed_date=CURRENT_DATE,status='completed' WHERE id=$1",[draft.id]);run();assert.equal((await one('SELECT status FROM tasks WHERE id=$1',[tasks[0].id])).status,'completed');
    await sql('DELETE FROM inventories WHERE id=$1',[draft.id]);run();assert.equal((await one('SELECT status FROM tasks WHERE id=$1',[tasks[0].id])).status,'pending');
    await sql('UPDATE tenants SET tenancy_start_date=CURRENT_DATE WHERE id=$1',[current.id]);run();const renewed=await sql("SELECT * FROM tasks WHERE task_type='inventory_due' AND entity_id=$1",[current.id]);assert.equal(renewed.length,2);assert.equal(renewed.filter(t=>t.status==='pending').length,1);
  });
  await test('insurance reminders open at fourteen days and close when a replacement policy covers the renewal',async()=>{
    const p=await one("INSERT INTO properties(address,postcode,landlord_id) VALUES('Insurance reminder test','WV1 1AA',$1) RETURNING id",[landlord.id]);
    const policy=await one("INSERT INTO property_policies(policy_type,annual_cost,commencement_date,expiry_date) VALUES('buildings',100,CURRENT_DATE-351,CURRENT_DATE+14) RETURNING id");
    await sql('INSERT INTO property_policy_allocations(policy_id,property_id,allocated_cost) VALUES($1,$2,100)',[policy.id,p.id]);
    const run=()=>{const result=spawnSync(process.execPath,['-e',"const db=require('./dist/db-pg');require('./dist/tenant-lifecycle-db').syncTenantLifecycle().then(()=>db.default.end()).catch(e=>{console.error(e);process.exit(1)})"],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};run();
    const reminder=await one("SELECT * FROM tasks WHERE task_type='insurance_renewal' AND entity_id=$1",[p.id]);assert.equal(reminder.status,'pending');
    const renewal=await one("INSERT INTO property_policies(policy_type,annual_cost,commencement_date,expiry_date) VALUES('buildings',110,CURRENT_DATE+15,CURRENT_DATE+379) RETURNING id");
    await sql('INSERT INTO property_policy_allocations(policy_id,property_id,allocated_cost) VALUES($1,$2,110)',[renewal.id,p.id]);run();assert.equal((await one('SELECT status FROM tasks WHERE id=$1',[reminder.id])).status,'completed');
  });
  await test('outgoing categories retain notes and documents; reversal excludes costs without losing evidence',async()=>{
    const connection=await one("SELECT id FROM bank_feed_connections LIMIT 1");
    const bank=await one("INSERT INTO bank_feed_transactions(connection_id,external_id,account_id,booked_at,amount) VALUES($1,'expense-reversal-test','test',NOW(),-240) RETURNING id",[connection.id]);
    await ok(`/api/bank-feed/transactions/${bank.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'assign',allocations:[{kind:'expense',property_id:property.id,category:'Service Charge',amount:240,notes:'Quarterly service charge'}]}});
    const allocated=await one('SELECT * FROM bank_feed_allocations WHERE bank_transaction_id=$1',[bank.id]);assert.equal(allocated.notes,'Quarterly service charge');
    const f=new FormData();f.append('file',new Blob([pdf],{type:'application/pdf'}),'Invoice.pdf');f.append('doc_type','Invoice');
    const upload=await fetch(base+`/api/documents/bank_transaction/${bank.id}`,{method:'POST',headers:{Authorization:`Bearer ${auth.staff}`},body:f});assert.equal(upload.status,200,await upload.text());
    assert.equal((await request(`/api/documents/bank_transaction/${bank.id}`,{token:auth.viewer})).status,403);
    const evidence=(await ok(`/api/documents/bank_transaction/${bank.id}`,{token:auth.staff}))[0];assert.equal((await request(`/api/documents/download/${evidence.id}`,{token:auth.viewer})).status,403);
    await ok(`/api/bank-feed/transactions/${bank.id}/reconcile`,{method:'POST',token:auth.staff,body:{action:'unassign'}});
    assert.equal((await one('SELECT is_estimate FROM property_expenses WHERE id=$1',[allocated.expense_id])).is_estimate,true);
    assert.equal((await ok(`/api/documents/bank_transaction/${bank.id}`,{token:auth.staff})).length,1);
  });
  console.log(`\n${passed} integration scenarios passed. Private artifacts: ${dir}`);
} catch(error) { console.error(error); console.error('Server log:',path.join(dir,'server.log')); process.exitCode=1; }
finally { server.kill('SIGTERM'); await once(server,'exit').catch(()=>{}); await db.end(); }
