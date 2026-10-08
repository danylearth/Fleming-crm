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

  for(const registration_type of ['Sole','Joint'])await test('new '+registration_type+' tenant intake stores applicants, town and channel choices',async()=>{
   const key=registration_type.toLowerCase(),body={registration_type,FirstName:'Fresh',Surname:key,address:'1 Example Road',city:'Wolverhampton',Postcode:'WV1 1AA',form_email:key+'@example.test',contactNumber:'07700900001',typeofproperty:['House'],EmploymentStatus:'Retired',AnnualSalary:'30000',marketing_preferences:'Email, SMS',FirstName2:'Joint',Surname2:'Partner',address2:'2 Example Road',city2:'Wolverhampton',Postcode2:'WV1 1BB',form_email2:'partner@example.test',contactNumber2:'07700900002',EmploymentStatus2:'Retired',AnnualSalary2:'25000'};
   const made=await ok('/api/public/tenant-enquiries',{method:'POST',body});assert(made.enquiry_id);
   const primary=await one('SELECT * FROM tenant_enquiries WHERE id=$1',[made.enquiry_id]);assert(primary.current_address_1.includes('Wolverhampton'));assert(primary.marketing_preferences.includes('Email'));assert(primary.marketing_preferences.includes('SMS'));
   if(registration_type==='Joint'){const partner=await one('SELECT * FROM tenant_enquiries WHERE id=$1',[made.partner_enquiry_id]);assert.equal(primary.joint_partner_id,partner.id);assert.equal(partner.joint_partner_id,primary.id);assert.equal(partner.first_name_1,'Joint');assert.equal(partner.email_1,'partner@example.test');assert.equal(partner.marketing_preferences,primary.marketing_preferences);}else assert(!made.partner_enquiry_id);
   assert.equal((await request('/api/public/tenant-enquiries',{method:'POST',body})).status,409);
   const permission=await one("SELECT * FROM marketing_permissions WHERE channel='email' AND destination=$1",[body.form_email]);assert(permission.allowed);
   const opt=await request('/api/public/marketing/unsubscribe/'+permission.unsubscribe_token);assert.equal(opt.status,200);assert(!(await one("SELECT allowed FROM marketing_permissions WHERE channel='email' AND destination=$1",[body.form_email])).allowed);const after=await one('SELECT marketing_preferences FROM tenant_enquiries WHERE id=$1',[primary.id]);assert(!after.marketing_preferences.includes('Email'));assert(after.marketing_preferences.includes('SMS'));
  });
  for(const registration_type of ['Sole','Joint','Limited Company'])await test('new '+registration_type+' landlord intake converts once and footer opt-out updates the record',async()=>{
   const key=registration_type.replaceAll(' ','').toLowerCase(),body={registration_type,firstName:'New',surname:'Owner '+key,email:key+'-owner@example.test',phone:'07700900111',address:'10 Example Road',city:'Wolverhampton',postcode:'WV1 1AA',propertyAddress:'20 Example Road',propertyCity:'Wolverhampton',propertyPostcode:'WV1 1BB',firstName2:'Second',surname2:'Owner',email2:'second-owner@example.test',phone2:'07700900112',address2:'11 Example Road',city2:'Wolverhampton',postcode2:'WV1 1CC',company_name:'Example Ltd',company_number:'12345678',company_address:'30 Example Road',companyCity:'Wolverhampton',companyPostcode:'WV1 1DD',beneficial_owners:'New Owner 100%',marketing_preferences:'Email, SMS'};
   const made=await request('/api/public/landlord-enquiries',{method:'POST',body});assert.equal(made.status,201,JSON.stringify(made.data));const id=made.data.enquiry_id;
   const converted=await ok('/api/landlords-bdm/'+id+'/convert',{method:'POST',token:auth.staff,body:{landlord_type:'external'}});const owner=await one('SELECT * FROM landlords WHERE id=$1',[converted.landlord_id]);assert.equal(owner.marketing_email,1);assert.equal(owner.marketing_sms,1);assert.equal(owner.marketing_phone,0);assert.equal(owner.marketing_post,0);assert.equal(owner.entity_type,registration_type==='Limited Company'?'company':'individual');assert.equal((await one('SELECT status FROM landlords_bdm WHERE id=$1',[id])).status,'onboarded');assert.equal((await request('/api/landlords-bdm/'+id+'/convert',{method:'POST',token:auth.staff,body:{}})).status,400);
   const permission=await one("SELECT * FROM marketing_permissions WHERE channel='email' AND destination=$1",[body.email]);assert.equal((await request('/api/public/marketing/unsubscribe/'+permission.unsubscribe_token)).status,200);const after=await one('SELECT marketing_email,marketing_sms FROM landlords WHERE id=$1',[owner.id]);assert.equal(after.marketing_email,0);assert.equal(after.marketing_sms,1);
  });
  console.log(passed+' fresh public intake and footer preference scenarios passed; deliveries intercepted locally.');
} catch(error) { console.error(error); console.error('Server log:',path.join(dir,'server.log')); process.exitCode=1; }
finally { server.kill('SIGTERM'); await once(server,'exit').catch(()=>{}); await db.end(); }
