import assert from 'node:assert/strict';
import {createChallenge,solveChallenge} from 'altcha-lib';
import {deriveKey} from 'altcha-lib/algorithms/pbkdf2';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,openSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
const url=new URL(process.env.TEST_DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/fleming_crm_test'));
const db=new pg.Pool({connectionString:url.toString()});assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
const dir=mkdtempSync(path.join(tmpdir(),'fleming-accounts-')),port=3317,env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',DATABASE_URL:url.toString(),JWT_SECRET:'local-account-tests-only',UPLOADS_PATH:dir,PORT:String(port),LOG_LEVEL:'error',ALLOW_SIMULATED_MESSAGES:'true'};
assert.equal(spawnSync(process.execPath,['dist/migrate.js'],{env,encoding:'utf8'}).status,0);
const fd=openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['dist/index-pg.js'],{env,stdio:['ignore',fd,fd]}),base=`http://localhost:${port}`;
let passed=0;const test=async(name,fn)=>{await fn();console.log('PASS '+name);passed++;};
const request=async(route,body,token,method=body?'POST':'GET')=>{const res=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};
const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const users={},auth={},password='Long initial password 128!';for(const role of ['admin','manager','staff']){users[role]=await one('INSERT INTO users(name,email,role,password) VALUES($1,$2,$3,$4) RETURNING id,email',['Test '+role,role+'@example.test',role,await bcrypt.hash(password,4)]);auth[role]=(await request('/api/auth/login',{email:users[role].email,password})).data.token;assert(auth[role]);}
 await test('staff cannot administer users',async()=>{assert.equal((await request('/api/users',{name:'Blocked',email:'blocked@example.test',role:'admin'},auth.staff)).status,403);assert.equal((await request('/api/account-requests',null,auth.staff)).status,403);});
 let pending,created;
 await test('manager requests access; only the assigned administrator approves',async()=>{const body={name:'New Staff',email:'new@example.test',role:'staff',finance_access:false};assert.equal((await request('/api/users',body,auth.manager)).status,400);assert.equal((await request('/api/users',{...body,approver_id:users.admin.id},auth.manager)).status,200);assert.equal((await one('SELECT COUNT(*)::int n FROM users WHERE email=$1',[body.email])).n,0);pending=await one("SELECT id FROM account_requests WHERE email='new@example.test'");assert.equal((await request(`/api/account-requests/${pending.id}/decision`,{decision:'approve'},auth.manager)).status,403);});
 await test('approved invitation is password-gated with a hashed 48-hour token',async()=>{assert.equal((await request(`/api/account-requests/${pending.id}/decision`,{decision:'approve'},auth.admin)).status,200);created=await one("SELECT * FROM users WHERE email='new@example.test'");assert.equal(created.password_setup_required,true);const token=await one('SELECT * FROM account_tokens WHERE user_id=$1',[created.id]);assert.match(token.token_hash,/^[a-f0-9]{64}$/);assert.equal(token.kind,'invite');assert(Math.abs(new Date(token.expires_at)-new Date(token.created_at)-48*3600e3)<1000);assert.equal((await request(`/api/account-requests/${pending.id}/decision`,{decision:'approve'},auth.admin)).status,400);});
 const solve=async(challenge)=>(Buffer.from(JSON.stringify({challenge,solution:await solveChallenge({challenge,deriveKey})})).toString('base64'));
 const proof=async()=>solve((await request('/api/auth/reset-challenge')).data);
 await test('forgot-password rejects missing, altered, expired and reused bot checks',async()=>{
  const email=users.staff.email;
  assert.equal((await request('/api/auth/forgot-password',{email})).status,400);
  const challenge=(await request('/api/auth/reset-challenge')).data;const altered=JSON.parse(Buffer.from(await solve(challenge),'base64'));altered.solution.counter++;
  assert.equal((await request('/api/auth/forgot-password',{email,altcha:Buffer.from(JSON.stringify(altered)).toString('base64')})).status,400);
  const secret=crypto.createHmac('sha256',env.JWT_SECRET).update('password-reset-bot-check').digest('hex');
  const expired=await createChallenge({algorithm:'PBKDF2/SHA-256',cost:1000,counter:1,deriveKey,hmacSignatureSecret:secret,expiresAt:new Date(Date.now()-1000),data:{purpose:'password-reset'}});
  assert.equal((await request('/api/auth/forgot-password',{email,altcha:await solve(expired)})).status,400);
  assert.equal((await one('SELECT count(*)::int n FROM account_requests WHERE user_id=$1',[users.staff.id])).n,0);
  const altcha=await proof();assert.equal((await request('/api/auth/forgot-password',{email,altcha})).status,200);assert.equal((await request('/api/auth/forgot-password',{email,altcha})).status,400);
 });
 await test('forgot-password remains private, deduplicates requests and creates no token before approval',async()=>{
  const active=await request('/api/auth/forgot-password',{email:users.staff.email,altcha:await proof()});const missing=await request('/api/auth/forgot-password',{email:'missing@example.test',altcha:await proof()});assert.equal(active.status,200);assert.deepEqual(active,missing);
  assert.equal((await one('SELECT count(*)::int n FROM account_tokens WHERE user_id=$1',[users.staff.id])).n,0);assert.equal((await one("SELECT count(*)::int n FROM account_requests WHERE kind='reset' AND user_id=$1",[users.staff.id])).n,1);
 });
 await test('reset tokens are single-use and revoke old sessions while permitting immediate login',async()=>{const raw=crypto.randomBytes(32).toString('base64url');await db.query("INSERT INTO account_tokens(user_id,token_hash,kind,expires_at) VALUES($1,$2,'reset',NOW()+INTERVAL '48 hours')",[users.staff.id,crypto.createHash('sha256').update(raw).digest('hex')]);const body={token:raw,password:'A completely new password 94!'};assert.equal((await request('/api/auth/set-password',body)).status,200);assert.equal((await request('/api/auth/me',null,auth.staff)).status,401);assert.equal((await request('/api/auth/set-password',body)).status,400);const fresh=await request('/api/auth/login',{email:users.staff.email,password:body.password});assert.equal(fresh.status,200);assert.equal((await request('/api/auth/me',null,fresh.data.token)).status,200);});
 await test('expired and deactivated account links cannot change a password',async()=>{for(const mode of ['expired','inactive']){const raw=crypto.randomBytes(32).toString('base64url');await db.query("INSERT INTO account_tokens(user_id,token_hash,kind,expires_at) VALUES($1,$2,'invite',NOW()+($3::int*INTERVAL '1 hour'))",[created.id,crypto.createHash('sha256').update(raw).digest('hex'),mode==='expired'?-1:1]);if(mode==='inactive')await db.query('UPDATE users SET is_active=0 WHERE id=$1',[created.id]);assert.equal((await request('/api/auth/set-password',{token:raw,password:'A valid test password 981!'})).status,400);}});
 await test('password reset requests are rate limited with a readable JSON error',async()=>{let response;for(let i=0;i<11;i++){response=await request('/api/auth/forgot-password',{email:'invalid'});if(response.status===429)break;}assert.equal(response.status,429);assert.match(response.data.error,/15 minutes/);});
 console.log(`${passed} account checks passed. Logs: ${dir}`);
}catch(error){console.error(error);process.exitCode=1;}finally{server.kill('SIGTERM');await db.end();}
