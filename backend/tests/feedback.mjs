import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,openSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
const databaseUrl=process.env.TEST_DATABASE_URL,url=new URL(databaseUrl);
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/fleming_crm_test'));
const db=new pg.Pool({connectionString:databaseUrl});
assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0,'Test database must be empty');
const dir=mkdtempSync(path.join(tmpdir(),'fleming-feedback-test-')),port=Number(process.env.TEST_PORT||3329),base=`http://127.0.0.1:${port}`,agentToken=crypto.randomBytes(32).toString('hex');
const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',DATABASE_URL:databaseUrl,JWT_SECRET:'feedback-test-only',UPLOADS_PATH:dir,PORT:String(port),LOG_LEVEL:'error',FEEDBACK_AGENT_TOKEN:agentToken};
for(let i=0;i<2;i++){const r=spawnSync(process.execPath,['dist/migrate.js'],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
const log=openSync(path.join(dir,'api.log'),'w'),server=spawn(process.execPath,['dist/index-pg.js'],{env,stdio:['ignore',log,log]});
const auth={};let passed=0;
async function request(route,{token,body,method='GET',form}={}){const r=await fetch(base+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:form||(body?JSON.stringify(body):undefined)});const txt=await r.text();let data;try{data=JSON.parse(txt);}catch{data=txt;}return{status:r.status,data,headers:r.headers};}
const admin=(route,opt={})=>request('/api/feedback'+route,{token:auth.admin,...opt}),agent=(route,opt={})=>request('/api/feedback-agent'+route,{token:agentToken,...opt});
const one=async(s,args=[])=> (await db.query(s,args)).rows[0],test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
function form({id=crypto.randomUUID(),reply=false,filename='notes.txt',content='Office feedback evidence',...extra}={}){const f=new FormData();f.set('client_id',id);f.set('body','Please make this easier to use.');if(!reply){f.set('title','Improve record notes');f.set('category','feature');f.set('priority','high');f.set('page_path','/tenants');f.set('anchor',JSON.stringify({selector:'main h1',label:'Tenants',x:.3,y:.4,pageX:.3,pageY:.1}));}for(const[k,v]of Object.entries(extra))f.set(k,v);if(filename)f.append('files',new Blob([content],{type:'text/plain'}),filename);return f;}
try{
 for(let i=0;i<100;i++){try{if((await request('/api/health')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const role of ['admin','staff']){await db.query('INSERT INTO users(email,password,name,role)VALUES($1,$2,$3,$4)',[role+'@example.test',await bcrypt.hash('Local-only-password',4),role,role]);auth[role]=(await request('/api/auth/login',{method:'POST',body:{email:role+'@example.test',password:'Local-only-password'}})).data.token;}
 await test('admin-only access and feedback-only worker credential',async()=>{
  assert.equal((await request('/api/feedback')).status,401);assert.equal((await request('/api/feedback',{token:auth.staff})).status,403);assert.equal((await request('/api/feedback',{method:'POST',token:auth.staff,form:form()})).status,403);assert.equal((await request('/api/feedback-agent/queue',{token:auth.admin})).status,401);assert.equal((await request('/api/tenants',{token:agentToken})).status,401);assert.equal((await request('/api/feedback-agent/queue',{token:'ü'.repeat(64)})).status,401);
 });
 let ticket,claim;const clientId=crypto.randomUUID();
 await test('atomic pin, text and attachment survive retries',async()=>{
  const r=await admin('',{method:'POST',form:form({id:clientId})});assert.equal(r.status,201,JSON.stringify(r.data));ticket=r.data;assert.equal(ticket.messages.length,1);assert.equal(ticket.files.length,1);assert.equal(ticket.anchor.label,'Tenants');assert(!('claim_token'in ticket));
  const retry=await admin('',{method:'POST',form:form({id:clientId})});assert.equal(retry.data.id,ticket.id);assert.equal(retry.data.files.length,1);
  const dl=await admin(`/${ticket.id}/files/${ticket.files[0].id}`);assert.equal(dl.data,'Office feedback evidence');assert.match(dl.headers.get('content-disposition'),/^attachment/);assert.equal(dl.headers.get('content-type'),'application/octet-stream');
 });
 await test('bad paths, malformed pins and executable uploads leave no partial requests',async()=>{
  for(const bad of [{page_path:'//evil.example'},{page_path:'/tenants?token=private'},{anchor:JSON.stringify({selector:'body',label:'x',x:2,y:0,pageX:0,pageY:0})},{filename:'unsafe.html'}])assert.equal((await admin('',{method:'POST',form:form(bad)})).status,400);
  assert.equal((await one('SELECT count(*)::int n FROM feedback_tickets')).n,1);
 });
 await test('agent evidence downloads remain scoped to the ticket',async()=>{
  const r=await agent(`/${ticket.id}`);assert.equal(r.data.files[0].sha256,crypto.createHash('sha256').update('Office feedback evidence').digest('hex'));assert.equal((await agent(`/${ticket.id}/files/${ticket.files[0].id}`)).data,'Office feedback evidence');assert.equal((await agent(`/9999/files/${ticket.files[0].id}`)).status,404);
 });
 await test('concurrent workers cannot claim one request twice',async()=>{
  const rs=await Promise.all(['a','b'].map(run_id=>agent(`/${ticket.id}/claim`,{method:'POST',body:{revision:1,run_id}})));assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);claim=rs.find(r=>r.status===200).data;assert.equal((await agent('/queue')).data.tickets.length,0);assert(!('claim_token'in(await admin(`/${ticket.id}`)).data));
 });
 await test('office replies invalidate old claims and deduplicate retries',async()=>{
  const id=crypto.randomUUID();const r=await admin(`/${ticket.id}/messages`,{method:'POST',form:form({id,reply:true})});assert.equal(r.data.revision,2);assert.equal(r.data.status,'queued');assert.equal((await admin(`/${ticket.id}/messages`,{method:'POST',form:form({id,reply:true})})).data.revision,2);
  assert.equal((await agent(`/${ticket.id}/update`,{method:'POST',body:{revision:1,claim_token:claim.claim_token,status:'completed',summary:'Stale completion',verification:'Local fixture',release:'abcdef1'}})).status,409);assert.equal((await one('SELECT count(*)::int n FROM feedback_notifications')).n,0);
 });
 await test('completion needs deployment evidence and queues one escaped notification',async()=>{
  claim=(await agent(`/${ticket.id}/claim`,{method:'POST',body:{revision:2,run_id:'c'}})).data;const b={revision:2,claim_token:claim.claim_token,status:'completed',summary:'Local test fixture <script>x</script>'};assert.equal((await agent(`/${ticket.id}/update`,{method:'POST',body:b})).status,400);assert.equal((await agent(`/${ticket.id}/update`,{method:'POST',body:{...b,verification:'Local fixture; no real deployment',release:'abcdef1'}})).status,200);assert.equal((await agent(`/${ticket.id}/update`,{method:'POST',body:{...b,verification:'Local fixture',release:'abcdef1'}})).status,409);
  const n=await one('SELECT * FROM feedback_notifications');assert.equal(n.to_email,'accounts@fleminglettings.co.uk');assert(!n.html.includes('<script>'));assert.equal((await one('SELECT count(*)::int n FROM feedback_notifications')).n,1);
 });
 await test('provider failure retains the notification for retry and records first attempt',async()=>{
  assert.equal((await agent('/notifications/send',{method:'POST',body:{}})).status,502);const n=await one('SELECT * FROM feedback_notifications');assert.equal(n.sent_at,null);assert.equal(n.attempts,1);assert(n.first_attempt_at);assert(n.last_error);
 });
 await test('completed items reopen and an expired worker cannot finish them',async()=>{
  ticket=(await admin(`/${ticket.id}/messages`,{method:'POST',form:form({reply:true,filename:null})})).data;assert.equal(ticket.revision,3);assert.equal(ticket.status,'queued');claim=(await agent(`/${ticket.id}/claim`,{method:'POST',body:{revision:3,run_id:'d'}})).data;
  await db.query("UPDATE feedback_tickets SET claimed_until=NOW()-INTERVAL '1 minute' WHERE id=$1",[ticket.id]);assert.equal((await agent('/queue')).data.tickets.length,1);assert.equal((await agent(`/${ticket.id}/update`,{method:'POST',body:{revision:3,claim_token:claim.claim_token,status:'blocked',summary:'Expired worker'}})).status,409);
  claim=(await agent(`/${ticket.id}/claim`,{method:'POST',body:{revision:3,run_id:'e'}})).data;assert.equal((await agent(`/${ticket.id}/update`,{method:'POST',body:{revision:3,claim_token:claim.claim_token,status:'blocked',summary:'Please identify the record.'}})).status,200);assert.equal((await agent('/queue')).data.tickets.length,0);
 });
 await test('uncertain email outside deduplication window requires reconciliation',async()=>{await db.query("UPDATE feedback_notifications SET first_attempt_at=NOW()-INTERVAL '25 hours'");assert.equal((await agent('/notifications/send',{method:'POST',body:{}})).status,409);});
 console.log(`\n${passed} feedback integration scenarios passed. Files: ${dir}`);
}finally{server.kill('SIGTERM');await db.end();}
