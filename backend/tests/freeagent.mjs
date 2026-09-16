// Exercise the OAuth callback against the real migrated PostgreSQL constraints.
// Only the FreeAgent token endpoint is replaced; no provider account is contacted.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import pg from 'pg';
import express from 'express';

const databaseUrl=process.env.TEST_DATABASE_URL;
assert(databaseUrl,'Set TEST_DATABASE_URL to an empty local fleming_crm_test database');
const target=new URL(databaseUrl);
assert(['127.0.0.1','localhost'].includes(target.hostname)&&target.pathname.startsWith('/fleming_crm_test'));
const db=new pg.Pool({connectionString:databaseUrl});
assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0,'Test database must be empty');
Object.assign(process.env,{
 NODE_ENV:'test',DATABASE_URL:databaseUrl,FREEAGENT_CLIENT_ID:'MixedCase-z2',
 FREEAGENT_CLIENT_SECRET:'test-only-secret',FREEAGENT_REDIRECT_URI:'https://api.example.test/api/freeagent/callback',
 BANK_FEED_ENCRYPTION_KEY:'ab'.repeat(32),FRONTEND_URL:'https://crm.example.test',
});
const migration=spawnSync(process.execPath,['dist/migrate.js'],{env:process.env,encoding:'utf8'});
assert.equal(migration.status,0,migration.stderr);
const require=createRequire(import.meta.url);
const {registerFreeAgentRoutes}=require('../dist/freeagent.js');
const {decryptToken}=require('../dist/bank-feed.js');
const pool=require('../dist/db-pg.js').default;
const app=express();registerFreeAgentRoutes(app);
app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
const realFetch=globalThis.fetch;let exchanges=0;let rejectToken=false;
globalThis.fetch=async(url,options)=>{
 assert.equal(url,'https://api.freeagent.com/v2/token_endpoint');
 assert.equal(options.headers.Authorization,`Basic ${Buffer.from('MixedCase-z2:test-only-secret').toString('base64')}`);
 assert.equal(options.body.get('redirect_uri'),process.env.FREEAGENT_REDIRECT_URI);
 exchanges++;
 return rejectToken?new Response('{}',{status:401}):new Response(JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600}));
};
async function pending(provider='freeagent',expired=false){
 const state=crypto.randomBytes(32).toString('base64url');
 const {rows}=await db.query("INSERT INTO bank_feed_connections(provider,status,state_hash,created_at) VALUES($1,'pending',$2,NOW()-($3::int*INTERVAL '1 minute')) RETURNING id",[provider,crypto.createHash('sha256').update(state).digest('hex'),expired?31:0]);
 return {id:rows[0].id,state};
}
const callback=state=>realFetch(`${base}/api/freeagent/callback?${new URLSearchParams({state,code:'test-code'})}`,{redirect:'manual'});
function redirect(response,outcome){assert.equal(response.status,303);assert.equal(response.headers.get('location'),`https://crm.example.test/settings?freeagent=${outcome}`);}
let passed=0;
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
try{
 await test('approval satisfies the real database constraint and stores an encrypted refresh token',async()=>{
  const attempt=await pending();const response=await callback(attempt.state);
  assert.equal(response.status,303,await response.text());redirect(response,'connected');
  const row=(await db.query('SELECT * FROM bank_feed_connections WHERE id=$1',[attempt.id])).rows[0];
  assert.equal(row.status,'connected');assert.equal(row.state_hash,null);
  assert.notEqual(row.refresh_token_encrypted,'test-refresh');assert.equal(decryptToken(row.refresh_token_encrypted),'test-refresh');
  const before=exchanges;redirect(await callback(attempt.state),'error');assert.equal(exchanges,before);
 });
 await test('concurrent callbacks exchange an approval code exactly once',async()=>{
  const attempt=await pending();const before=exchanges;
  const responses=await Promise.all([callback(attempt.state),callback(attempt.state)]);
  assert(responses.every(r=>r.status===303));assert.equal(exchanges,before+1);
  assert.deepEqual(responses.map(r=>new URL(r.headers.get('location')).searchParams.get('freeagent')).sort(),['connected','error']);
 });
 await test('expired, unknown and other-provider states never reach the token endpoint',async()=>{
  const expired=await pending('freeagent',true);const other=await pending('truelayer');const before=exchanges;
  for(const state of [expired.state,other.state,'unknown'])redirect(await callback(state),'error');
  assert.equal(exchanges,before);
 });
 await test('provider rejection records a safe error and redirects back to the CRM',async()=>{
  const attempt=await pending();rejectToken=true;redirect(await callback(attempt.state),'error');
  const row=(await db.query('SELECT status,state_hash,last_error FROM bank_feed_connections WHERE id=$1',[attempt.id])).rows[0];
  assert.equal(row.status,'error');assert.equal(row.state_hash,null);assert.equal(row.last_error,'Authorisation failed. Reconnect FreeAgent.');
  const before=exchanges;redirect(await callback(attempt.state),'error');assert.equal(exchanges,before);
 });
 console.log(`${passed} FreeAgent PostgreSQL/HTTP scenarios passed`);
}catch(error){
 console.error(error);process.exitCode=1;
}finally{
 globalThis.fetch=realFetch;
 await new Promise(resolve=>server.close(resolve));await pool.end();await db.end();
}
