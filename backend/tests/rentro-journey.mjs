// Rentro journey over real HTTP and PostgreSQL. Requires only an EMPTY local test database.
// Supabase is replaced by a small local stand-in (signing keys, admin user creation), so nothing
// leaves this machine; uploads use local storage and email uses the isolated transport.
//   TEST_DATABASE_URL=postgresql://…/fleming_crm_test_rentro npm run build && node tests/rentro-journey.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, openSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to an EMPTY local PostgreSQL database with a name starting fleming_crm_test');
const url = new URL(databaseUrl);
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.startsWith('/fleming_crm_test'), 'Integration tests only run on a dedicated local test database');
const db = new pg.Pool({ connectionString: databaseUrl });
assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, 0, 'Test database must be empty');

// --- Local stand-in for the Supabase project ---------------------------------------------------
const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'journey', alg: 'ES256', use: 'sig' };
const users = new Map();
const supabasePort = Number(process.env.TEST_SUPABASE_PORT || 3398);
const supabaseUrl = `http://127.0.0.1:${supabasePort}`;
const supabase = createServer(async (req, res) => {
  const body = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); });
  const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const route = new URL(req.url, supabaseUrl).pathname;
  if (req.method === 'GET' && route === '/auth/v1/.well-known/jwks.json') return send(200, { keys: [jwk] });
  if (req.method === 'POST' && route === '/auth/v1/admin/generate_link') {
    if ([...users.values()].some(u => u.email === body.email)) return send(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
    const user = { id: randomUUID(), aud: 'authenticated', role: 'authenticated', email: body.email, user_metadata: body.data || {}, app_metadata: {}, created_at: new Date().toISOString() };
    users.set(user.id, user);
    return send(200, { ...user, action_link: `${supabaseUrl}/auth/v1/verify?token=${randomUUID()}&type=signup`, email_otp: '000000', hashed_token: 'h', redirect_to: body.redirect_to || '', verification_type: 'signup' });
  }
  if (req.method === 'DELETE' && route.startsWith('/auth/v1/admin/users/')) { users.delete(route.split('/').pop()); return send(200, {}); }
  send(404, { msg: 'not found' });
}).listen(supabasePort, '127.0.0.1');
const tokenFor = (userId, email, claims = {}) => new SignJWT({ role: 'authenticated', email, ...claims }).setProtectedHeader({ alg: 'ES256', kid: 'journey' })
  .setSubject(userId).setIssuer(`${supabaseUrl}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey);

// --- The CRM API -------------------------------------------------------------------------------
const dir = mkdtempSync(path.join(tmpdir(), 'rentro-journey-'));
const port = Number(process.env.TEST_PORT || 3310);
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', DATABASE_URL: databaseUrl, JWT_SECRET: 'journey-only-do-not-deploy-this-secret',
  PORTAL_CREDENTIALS_KEY: Buffer.alloc(32, 1).toString('base64'), UPLOADS_PATH: dir, PORT: String(port), LOG_LEVEL: 'error',
  RENTRO_ENABLED: 'true', RENTRO_SIGNUP: 'allowlist', SUPABASE_URL: supabaseUrl, SUPABASE_SECRET_KEY: 'journey-secret-key', RENTRO_STORAGE: 'local',
  RESEND_API_KEY: 're_isolated_test',
};
for (const run of [1, 2]) {
  const migration = spawnSync(process.execPath, ['dist/migrate.js'], { env, encoding: 'utf8' });
  assert.equal(migration.status, 0, `migration run ${run}: ${migration.stderr}`);
}
const log = openSync(path.join(dir, 'server.log'), 'w');
const server = spawn(process.execPath, ['--require', './tests/isolated-email-transport.cjs', 'dist/index-pg.js'], { env, stdio: ['ignore', log, log] });
const base = `http://127.0.0.1:${port}`;

let passed = 0, failed = 0, ip = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`); console.error(error); process.exitCode = 1; }
}
async function request(route, { method = 'GET', body, token, form } = {}) {
  const headers = { 'X-Forwarded-For': `198.51.100.${(ip++ % 250) + 1}`, 'User-Agent': 'rentro-journey', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + route, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const sql = async (text, args = []) => (await db.query(text, args)).rows;
const altcha = async () => { const challenge = (await request('/api/rentro/signup-challenge')).data; return Buffer.from(JSON.stringify({ challenge, solution: await solveChallenge({ challenge, deriveKey }) })).toString('base64'); };
const signup = async (email, name) => request('/api/rentro/signup', { method: 'POST', body: { email, name, password: 'correct horse battery staple', terms: true, altcha: await altcha() } });
const account = async email => (await sql('SELECT id FROM customer_accounts WHERE email=$1', [email]))[0];
const home = (n, extra = {}) => ({ address: `${n} Navarino Road`, postcode: 'E8 1AD', city: 'London', property_type: 'flat', bedrooms: 2, occupancy: 'occupied', claimed_role: 'owner', ...extra });

try {
  for (let i = 0; i < 100; i++) { try { if ((await request('/api/health')).status === 200) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  await test('fresh schema with Rentro migrations boots, and Rentro is switched on', async () => {
    assert.equal((await request('/api/rentro/status')).data.enabled, true);
  });

  let lee, leeToken, sam, samToken;
  await test('sign-up is invite-only during the pilot and needs the bot check', async () => {
    assert.equal((await signup('stranger@example.test', 'Sam Stranger')).status, 403);
    await sql("INSERT INTO rentro_pilot_allowlist(email) VALUES('lee@example.test'),('sam@example.test')");
    const noBotCheck = await request('/api/rentro/signup', { method: 'POST', body: { email: 'lee@example.test', name: 'Lee Landlord', password: 'correct horse battery staple', terms: true } });
    assert.equal(noBotCheck.status, 400);
    const ok = await signup('lee@example.test', 'Lee Landlord');
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal(ok.data.email_sent, true);
    assert.equal((await signup('lee@example.test', 'Lee Landlord')).status, 409);
    lee = await account('lee@example.test');
    leeToken = await tokenFor(lee.id, 'lee@example.test');
    const row = (await sql("SELECT l.source,l.landlord_type,r.status FROM customer_roles r JOIN landlords l ON l.id=r.landlord_id WHERE r.account_id=$1", [lee.id]))[0];
    assert.deepEqual(row, { source: 'rentro', landlord_type: 'external', status: 'active' });
  });

  await test('the signed-in account sees its landlord role; bad tokens are refused', async () => {
    const me = await request('/api/rentro/me', { token: leeToken });
    assert.equal(me.status, 200);
    assert.deepEqual(me.data.roles, [{ role: 'landlord', status: 'active' }]);
    assert.equal((await request('/api/rentro/me')).status, 401);
    assert.equal((await request('/api/rentro/me', { token: await tokenFor(lee.id, 'lee@example.test', { is_anonymous: true }) })).status, 401);
    assert.equal((await request('/api/rentro/me', { token: await tokenFor(randomUUID(), 'ghost@example.test') })).status, 403);
  });

  await test('a Rentro token cannot reach staff routes', async () => {
    assert.equal((await request('/api/properties', { token: leeToken })).status, 401);
    assert.equal((await request('/api/tasks', { method: 'POST', token: leeToken, body: { title: 'x' } })).status, 401);
  });

  let first;
  await test('design test: ten occupied homes join with no listing, package or agreement', async () => {
    const one = await request('/api/rentro/properties', { method: 'POST', token: leeToken, body: home(1) });
    assert.equal(one.status, 201, JSON.stringify(one.data));
    first = one.data.property_id;
    const rows = Array.from({ length: 9 }, (_, i) => home(i + 2));
    const preview = await request('/api/rentro/properties/import', { method: 'POST', token: leeToken, body: { rows } });
    assert.equal(preview.status, 200);
    assert.equal(preview.data.ready, true);
    assert.equal((await sql("SELECT count(*)::int AS n FROM properties WHERE address LIKE '%Navarino Road'"))[0].n, 1, 'preview must not save anything');
    const done = await request('/api/rentro/properties/import', { method: 'POST', token: leeToken, body: { rows, confirm: true } });
    assert.equal(done.status, 201, JSON.stringify(done.data));
    assert.equal(done.data.created, 9);
    const portfolio = await request('/api/rentro/portfolio', { token: leeToken });
    assert.equal(portfolio.data.homes.length, 10);
    assert(portfolio.data.homes.every(h => h.management_mode === 'self_managed' && h.ownership.label === 'To do'));
    const stored = await sql("SELECT status,service_type,management_mode,occupancy FROM properties WHERE address LIKE '%Navarino Road'");
    assert(stored.every(p => p.status === 'let' && p.service_type === null && p.management_mode === 'self_managed' && p.occupancy === 'occupied'));
    assert.equal((await sql('SELECT count(*)::int AS n FROM landlord_service_agreements'))[0].n, 0);
    assert.equal((await sql("SELECT count(*)::int AS n FROM tasks WHERE task_type LIKE 'rentro_%'"))[0].n, 0, 'no staff work until something needs review');
  });

  await test('an import with a bad row saves nothing and points at the row', async () => {
    const bad = await request('/api/rentro/properties/import', { method: 'POST', token: leeToken, body: { rows: [home(20), home(21, { postcode: 'nope' })], confirm: true } });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.rows[1].ok, false);
    assert.equal((await sql("SELECT count(*)::int AS n FROM properties WHERE address IN ('20 Navarino Road','21 Navarino Road')"))[0].n, 0);
  });

  await test('an address already on Fleming’s records is not attached; staff review the claim', async () => {
    const landlord = (await sql("INSERT INTO landlords(name,email) VALUES('Fleming Client','client@example.test') RETURNING id"))[0];
    const existing = (await sql("INSERT INTO properties(address,postcode,landlord_id) VALUES('5 Wilton Way','E8 1BG',$1) RETURNING id", [landlord.id]))[0];
    const claim = await request('/api/rentro/properties', { method: 'POST', token: leeToken, body: home(0, { address: '5 Wilton Way', postcode: 'e81bg' }) });
    assert.equal(claim.status, 202);
    assert.equal(claim.data.status, 'duplicate_review');
    const portfolio = (await request('/api/rentro/portfolio', { token: leeToken })).data;
    assert.equal(portfolio.homes.length, 10);
    assert.equal(portfolio.checking.length, 1);
    assert.equal((await request(`/api/rentro/properties/${existing.id}`, { token: leeToken })).status, 404);
    assert.equal((await sql("SELECT count(*)::int AS n FROM tasks WHERE task_type='rentro_authority' AND entity_id=$1", [existing.id]))[0].n, 1);
  });

  await test('another landlord cannot see or change someone else’s home', async () => {
    assert.equal((await signup('sam@example.test', 'Sam Second')).status, 201);
    sam = await account('sam@example.test');
    samToken = await tokenFor(sam.id, 'sam@example.test');
    assert.equal((await request('/api/rentro/portfolio', { token: samToken })).data.homes.length, 0);
    assert.equal((await request(`/api/rentro/properties/${first}`, { token: samToken })).status, 404);
    assert.equal((await request(`/api/rentro/properties/${first}`, { method: 'PUT', token: samToken, body: { occupancy: 'vacant' } })).status, 404);
    const form = new FormData(); form.append('file', new Blob([Buffer.from('%PDF-1.4 sam')], { type: 'application/pdf' }), 'deed.pdf');
    assert.equal((await request(`/api/rentro/properties/${first}/authority`, { method: 'POST', token: samToken, form })).status, 404);
    assert.equal((await request('/api/rentro/properties/not-a-number', { token: samToken })).status, 404);
  });

  await test('a landlord edits their own home, and vacant homes are never marked for letting', async () => {
    const edit = await request(`/api/rentro/properties/${first}`, { method: 'PUT', token: leeToken, body: { occupancy: 'vacant', bedrooms: 3 } });
    assert.equal(edit.status, 200, JSON.stringify(edit.data));
    assert.deepEqual((await sql('SELECT status,occupancy,bedrooms,address FROM properties WHERE id=$1', [first]))[0], { status: null, occupancy: 'vacant', bedrooms: 3, address: '1 Navarino Road' });
  });

  await test('ownership evidence is stored privately, goes to review, and creates one staff task', async () => {
    const reject = new FormData(); reject.append('file', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'application/pdf' }), 'deed.pdf');
    assert.equal((await request(`/api/rentro/properties/${first}/authority`, { method: 'POST', token: leeToken, form: reject })).status, 400);
    for (let i = 0; i < 2; i++) {
      const form = new FormData(); form.append('doc_type', 'Land Registry'); form.append('file', new Blob([Buffer.from(`%PDF-1.4 title ${i}`)], { type: 'application/pdf' }), '../../title.pdf');
      const upload = await request(`/api/rentro/properties/${first}/authority`, { method: 'POST', token: leeToken, form });
      assert.equal(upload.status, 201, JSON.stringify(upload.data));
      assert.equal(upload.data.ownership.label, 'In review');
    }
    const doc = (await sql("SELECT filename,original_name,review_status,origin,customer_visibility,storage_backend,uploaded_by_account FROM documents WHERE entity_type='property' AND entity_id=$1 ORDER BY id DESC LIMIT 1", [first]))[0];
    assert.equal(doc.review_status, 'pending');
    assert.equal(doc.origin, 'rentro_upload');
    assert.equal(doc.customer_visibility, 'landlord');
    assert.equal(doc.uploaded_by_account, lee.id);
    assert.equal(doc.original_name, 'title.pdf');
    assert.match(doc.filename, /^properties\/\d+\/[0-9a-f-]{36}\.pdf$/);
    assert(existsSync(path.join(dir, 'rentro', doc.filename)));
    assert.equal(readFileSync(path.join(dir, 'rentro', doc.filename), 'utf8'), '%PDF-1.4 title 1');
    assert.equal((await sql("SELECT count(*)::int AS n FROM tasks WHERE task_type='rentro_authority' AND entity_id=$1 AND status='pending'", [first]))[0].n, 1);
    assert.equal((await request('/api/rentro/portfolio', { token: leeToken })).data.homes.find(h => h.id === first).ownership.label, 'In review');
  });


  let staffToken;
  await test('staff sign in to the CRM as usual', async () => {
    const password = 'Journey-staff-password-713!';
    await sql('INSERT INTO users(email,password,name,role) VALUES($1,$2,$3,$4)', ['staff@example.test', await bcrypt.hash(password, 4), 'Journey Staff', 'staff']);
    const user = (await sql('SELECT id FROM users WHERE email=$1', ['staff@example.test']))[0];
    const device = randomBytes(32).toString('hex'), sha = v => createHash('sha256').update(v).digest('hex');
    await sql("INSERT INTO trusted_login_devices(token_hash,user_id,user_agent_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')", [sha(device), user.id, sha('rentro-journey')]);
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'rentro-journey', Cookie: `fleming_device_${user.id}=${device}` }, body: JSON.stringify({ email: 'staff@example.test', password }) });
    assert.equal(login.status, 200);
    staffToken = (await login.json()).token;
    assert(staffToken);
  });

  await test('customers cannot use the staff Rentro tools', async () => {
    assert.equal((await request('/api/rentro-admin/ownership', { token: leeToken })).status, 401);
    assert.equal((await request('/api/rentro-admin/allowlist', { method: 'POST', token: leeToken, body: { email: 'x@example.test' } })).status, 401);
    assert.equal((await request('/api/rentro-admin/ownership')).status, 401);
  });

  await test('staff reject proof with a note; the landlord sees Action needed and uploads again', async () => {
    const queue = (await request('/api/rentro-admin/ownership', { token: staffToken })).data;
    const evidence = queue.find(c => c.kind === 'evidence' && c.property_id === first);
    assert(evidence && evidence.document_id, 'evidence claim is in the queue');
    const file = await fetch(`${base}/api/rentro-admin/documents/${evidence.document_id}/file`, { headers: { Authorization: `Bearer ${staffToken}` } });
    assert.equal(file.status, 200);
    assert.equal(await file.text(), '%PDF-1.4 title 1');
    assert.equal((await request(`/api/rentro-admin/ownership/${evidence.id}/decision`, { method: 'POST', token: staffToken, body: { decision: 'rejected' } })).status, 400, 'a rejection needs a note');
    assert.equal((await request(`/api/rentro-admin/ownership/${evidence.id}/decision`, { method: 'POST', token: staffToken, body: { decision: 'rejected', notes: 'The name on the title does not match' } })).status, 200);
    const home = (await request(`/api/rentro/portfolio`, { token: leeToken })).data.homes.find(h => h.id === first);
    assert.equal(home.ownership.label, 'Action needed');
    assert.match(home.ownership.next, /name on the title/);
    assert.equal((await sql("SELECT review_status FROM documents WHERE id=$1", [evidence.document_id]))[0].review_status, 'rejected');
    assert.equal((await sql("SELECT count(*)::int AS n FROM tasks WHERE task_type='rentro_authority' AND entity_id=$1 AND status='pending'", [first]))[0].n, 0);
    const form = new FormData(); form.append('file', new Blob([Buffer.from('%PDF-1.4 corrected title')], { type: 'application/pdf' }), 'title.pdf');
    assert.equal((await request(`/api/rentro/properties/${first}/authority`, { method: 'POST', token: leeToken, form })).status, 201);
  });

  await test('staff verify the new proof; the home shows Approved and the decision is audited', async () => {
    const queue = (await request('/api/rentro-admin/ownership', { token: staffToken })).data;
    const evidence = queue.find(c => c.kind === 'evidence' && c.property_id === first);
    assert.equal((await request(`/api/rentro-admin/ownership/${evidence.id}/decision`, { method: 'POST', token: staffToken, body: { decision: 'verified' } })).status, 200);
    assert.equal((await request(`/api/rentro-admin/ownership/${evidence.id}/decision`, { method: 'POST', token: staffToken, body: { decision: 'verified' } })).status, 409, 'a decision is only made once');
    assert.equal((await request(`/api/rentro/properties/${first}`, { token: leeToken })).data.ownership.label, 'Approved');
    const form = new FormData(); form.append('file', new Blob([Buffer.from('%PDF-1.4 extra')], { type: 'application/pdf' }), 'x.pdf');
    assert.equal((await request(`/api/rentro/properties/${first}/authority`, { method: 'POST', token: leeToken, form })).status, 409, 'no more uploads once verified');
    assert.equal((await sql("SELECT count(*)::int AS n FROM audit_log WHERE entity_type='rentro_property_claim' AND user_email='staff@example.test'"))[0].n, 2);
  });

  await test('verifying a claim on an existing address links the landlord as a co-owner', async () => {
    const claim = (await request('/api/rentro-admin/ownership', { token: staffToken })).data.find(c => c.kind === 'existing_address');
    assert(claim);
    assert.equal((await request(`/api/rentro-admin/ownership/${claim.id}/decision`, { method: 'POST', token: staffToken, body: { decision: 'verified' } })).status, 200);
    const portfolio = (await request('/api/rentro/portfolio', { token: leeToken })).data;
    assert.equal(portfolio.checking.length, 0);
    const linked = portfolio.homes.find(h => h.id === claim.duplicate_of_property_id);
    assert(linked, 'the existing property is now in the portfolio');
    assert.equal(linked.management_mode, 'fleming');
    assert.equal((await sql('SELECT is_primary FROM property_landlords WHERE property_id=$1 AND landlord_id=$2', [claim.duplicate_of_property_id, claim.landlord_id]))[0].is_primary, 0);
    assert.equal((await request(`/api/rentro/properties/${claim.duplicate_of_property_id}`, { method: 'PUT', token: leeToken, body: { occupancy: 'vacant' } })).status, 409, 'Fleming-managed homes are not edited by the landlord');
  });

  await test('a sign-up whose email matches an existing CRM landlord waits for staff to link it', async () => {
    await sql("INSERT INTO rentro_pilot_allowlist(email) VALUES('client@example.test')");
    const res = await signup('client@example.test', 'Fleming Client');
    assert.equal(res.status, 201);
    assert.equal(res.data.pending_link, true);
    const client = await account('client@example.test');
    const token = await tokenFor(client.id, 'client@example.test');
    const portfolio = await request('/api/rentro/portfolio', { token });
    assert.equal(portfolio.status, 403);
    assert.match(portfolio.data.error, /connecting your account/);
    assert.equal((await sql("SELECT count(*)::int AS n FROM landlords WHERE email='client@example.test'"))[0].n, 1, 'no duplicate landlord record');
  });


  await test('staff link a waiting sign-up to the matching CRM landlord, once', async () => {
    const accounts = (await request('/api/rentro-admin/accounts', { token: staffToken })).data;
    const waiting = accounts.find(a => a.email === 'client@example.test');
    assert.equal(waiting.matching_landlords.length, 1);
    const link = await request(`/api/rentro-admin/accounts/${waiting.id}/link-landlord`, { method: 'POST', token: staffToken, body: { landlord_id: waiting.matching_landlords[0].id } });
    assert.equal(link.status, 200, JSON.stringify(link.data));
    assert.equal((await request(`/api/rentro-admin/accounts/${waiting.id}/link-landlord`, { method: 'POST', token: staffToken, body: { landlord_id: waiting.matching_landlords[0].id } })).status, 409);
    const token = await tokenFor(waiting.id, 'client@example.test');
    const portfolio = await request('/api/rentro/portfolio', { token });
    assert.equal(portfolio.status, 200);
    assert(portfolio.data.homes.some(h => h.address === '5 Wilton Way'), 'their existing Fleming property appears');
  });

  await test('staff manage the pilot allowlist', async () => {
    assert.equal((await request('/api/rentro-admin/allowlist', { method: 'POST', token: staffToken, body: { email: 'New.Person@Example.test', note: 'Met at the office' } })).status, 201);
    assert((await request('/api/rentro-admin/allowlist', { token: staffToken })).data.some(w => w.email === 'new.person@example.test'));
    assert.equal((await request('/api/rentro-admin/allowlist/new.person%40example.test', { method: 'DELETE', token: staffToken })).status, 200);
    assert.equal((await signup('new.person@example.test', 'New Person')).status, 403);
  });

  await test('every Rentro change is in the audit log under the customer account', async () => {
    const audits = await sql('SELECT action,entity_type FROM audit_log WHERE customer_account_id=$1', [lee.id]);
    for (const action of ['create', 'import', 'update', 'upload']) assert(audits.some(a => a.action === action), action);
  });
} finally {
  server.kill(); supabase.close(); await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) console.log(`Server log: ${path.join(dir, 'server.log')}`);
}
