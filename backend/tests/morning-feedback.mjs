import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,openSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
const url=new URL(process.env.TEST_DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/fleming_crm_test'));
const db=new pg.Pool({connectionString:url.toString()});assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
const dir=mkdtempSync(path.join(tmpdir(),'fleming-morning-')),port=3324;
const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',DATABASE_URL:url.toString(),JWT_SECRET:'afternoon-local-only',UPLOADS_PATH:dir,PORT:String(port),BASE_URL:`http://127.0.0.1:${port}`,LOG_LEVEL:'error',ALLOW_SIMULATED_MESSAGES:'true'};
const migration=spawnSync(process.execPath,['dist/migrate.js'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
const server=spawn(process.execPath,['dist/index-pg.js'],{env,stdio:['ignore',openSync(path.join(dir,'server.log'),'w'),openSync(path.join(dir,'errors.log'),'w')]});
const one=async(t,a=[])=>(await db.query(t,a)).rows[0];
async function request(route,{method='GET',body,token}={}){const multipart=body instanceof FormData;const r=await fetch(`http://127.0.0.1:${port}`+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body&&!multipart?{'Content-Type':'application/json'}:{})},body:body?(multipart?body:JSON.stringify(body)):undefined});return {status:r.status,data:await r.json()};}
let passed=0;const test=async(name,fn)=>{await fn();console.log('PASS '+name);passed++;};
try{
 for(let i=0;i<100;i++){try{if((await request('/api/health')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const tokens={},users={};for(const role of ['admin','manager','staff','viewer']){const u=await one('INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4) RETURNING id',['QA '+role,role+'@example.test',await bcrypt.hash('Test-password-123!',4),role]);users[role]=u.id;const login=await request('/api/auth/login',{method:'POST',body:{email:role+'@example.test',password:'Test-password-123!'}});assert.equal(login.status,200);tokens[role]=login.data.token;}
 const api=(route,body,method=body?'POST':'GET',role='admin')=>request(route,{method,body,token:tokens[role]});
 const landlord=await one("INSERT INTO landlords(name,landlord_type) VALUES('Portfolio','internal') RETURNING id"),p=await one("INSERT INTO properties(address,postcode,landlord_id) VALUES('1 Test Street','WV1 1AA',$1) RETURNING id",[landlord.id]),p2=await one("INSERT INTO properties(address,postcode,landlord_id) VALUES('2 Test Street','WV1 1AA',$1) RETURNING id",[landlord.id]);
 const tenant=await one("INSERT INTO tenants(first_name_1,last_name_1,name,email,phone,status,property_id,tenancy_start_date,monthly_rent) VALUES('Current','Tenant','Current Tenant','tenant@example.test','07700900123','active',$1,CURRENT_DATE-365,550) RETURNING *",[p.id]);
 await test('team deletion preserves accounts/roles and clears memberships, including archived members',async()=>{
  const team=(await api('/api/departments',{name:'Temporary Office',user_ids:[users.staff,users.viewer]})).data;
  await db.query('UPDATE users SET is_active=0 WHERE id=$1',[users.viewer]);
  assert.equal((await api('/api/departments/'+team.id,null,'DELETE','staff')).status,403);
  assert.equal((await api('/api/departments/'+team.id,null,'DELETE','manager')).status,200);
  assert.equal((await one('SELECT department FROM users WHERE id=$1',[users.viewer])).department,'');
  assert.equal((await one('SELECT role FROM users WHERE id=$1',[users.staff])).role,'staff');
  assert.equal((await one("SELECT count(*)::int n FROM audit_log WHERE entity_type='department' AND action='delete'")).n,1);
  await db.query('UPDATE users SET is_active=1 WHERE id=$1',[users.viewer]);
 });
 await test('optional UK/Ireland phone and contact email survive authentication without changing login',async()=>{
  for(const phone of ['', '+44 1902 212415','07123 456789','+353 1 2345678'])assert.equal((await api('/api/auth/profile/contact',{phone,contact_email:'office@example.test',department:''},'PUT','viewer')).status,200);
  const me=(await api('/api/auth/me',null,'GET','viewer')).data.user;assert.equal(me.contact_email,'office@example.test');assert.equal(me.email,'viewer@example.test');
 });
 await test('inventory completion requires signed evidence for the current tenancy',async()=>{
  await api('/api/dashboard');const task=await one("SELECT * FROM tasks WHERE task_type='inventory_due' AND entity_id=$1",[tenant.id]);assert(task);
  const result=await api('/api/tasks/'+task.id,{status:'completed'},'PUT');assert.equal(result.status,409);assert(result.data.error.includes('signed inventory'));
  await one("INSERT INTO inventories(property_id,tenant_id,inventory_type,inspection_date,signed_date) VALUES($1,$2,'check_in',CURRENT_DATE,CURRENT_DATE) RETURNING id",[p.id,tenant.id]);
  assert.equal((await api('/api/tasks/'+task.id,{status:'completed'},'PUT')).status,200);
  await api('/api/dashboard');assert.equal((await one('SELECT status FROM tasks WHERE id=$1',[task.id])).status,'completed');
 });
 await test('inspection assignment updates its task and completion requires an inspection record',async()=>{
  const route='/api/properties/'+p.id+'/inspections/assignment';
  assert.equal((await api(route,{assigned_to:users.viewer},'PUT')).status,400);
  assert.equal((await api(route,{assigned_to:users.staff},'PUT','viewer')).status,403);
  assert.equal((await api(route,{assigned_to:users.staff},'PUT')).status,200);
  assert.equal((await api('/api/properties/'+p.id+'/inspections')).data.assigned_to,String(users.staff));
  const task=await one("SELECT id FROM tasks WHERE entity_type='property' AND entity_id=$1 AND task_type='property_inspection' AND status='pending'",[p.id]);
  assert.equal((await api('/api/tasks/'+task.id,{status:'completed'},'PUT')).status,409);
 });
 await test('large JPEG uploads deduplicate and campaign sending logs the message on its landlord enquiry',async()=>{
  const prospect=(await api('/api/landlords-bdm',{name:'Marketing Prospect',email:'prospect@example.test'})).data.id;
  await api('/api/marketing/permission',{channel:'email',destination:'prospect@example.test',allowed:true},'PUT');
  const jpeg=await sharp({create:{width:20,height:20,channels:3,background:'#123456'}}).jpeg().toBuffer();
  const body=new FormData();body.append('file',new Blob([jpeg,Buffer.alloc(5*1024*1024)],{type:'image/jpeg'}),'test.jpeg');
  const upload=await api('/api/marketing/attachments',body);assert.equal(upload.status,201,JSON.stringify(upload));
  assert.equal((await api('/api/marketing/attachments',body)).data.id,upload.data.id);
  const campaign=await api('/api/marketing/campaigns',{channel:'email',subject:'QA only',message:'<p>Dear {{FIRST_NAME}}, test.</p>',message_format:'html',recipients:['landlord_bdm:'+prospect],attachment_ids:[upload.data.id]});assert.equal(campaign.status,201,JSON.stringify(campaign));
  assert.equal((await api('/api/marketing/campaigns/'+campaign.data.id+'/send',{})).status,202);
  let message;for(let i=0;i<50;i++){message=await one("SELECT * FROM email_messages WHERE entity_type='landlord_bdm' AND entity_id=$1",[prospect]);if(message)break;await new Promise(r=>setTimeout(r,100));}
  assert(message);assert.equal(message.status,'simulated');assert(message.body_html.includes('/api/public/marketing/unsubscribe/'));assert(message.body_html.includes('Dear Marketing'));
 });
 await test('marketing preference GET is read-only; explicit POST supports both opt-out and opt-in',async()=>{
  const p=await one("SELECT * FROM marketing_permissions WHERE destination='prospect@example.test'");const url='http://127.0.0.1:'+port+'/api/public/marketing/unsubscribe/'+p.unsubscribe_token;
  assert((await (await fetch(url)).text()).includes('Opt in to marketing'));
  assert.equal((await one('SELECT allowed FROM marketing_permissions WHERE destination=$1',[p.destination])).allowed,true);
  for(const preference of ['out','in']){assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'preference='+preference})).status,200);assert.equal((await one('SELECT allowed FROM marketing_permissions WHERE destination=$1',[p.destination])).allowed,preference==='in');}
 });
 await test('financial summary includes vacancy breakdown and linked bank expenses cannot be deleted',async()=>{
  const connection=await one("INSERT INTO bank_feed_connections(provider,status) VALUES('truelayer','connected') RETURNING id");
  const bank=await one("INSERT INTO bank_feed_transactions(connection_id,external_id,account_id,booked_at,amount,currency,description) VALUES($1,'morning-test','test','2025-01-01',-100,'GBP','Utility bill') RETURNING id",[connection.id]);
  const allocation=await api('/api/bank-feed/transactions/'+bank.id+'/reconcile',{action:'assign',allocations:[{kind:'financial',amount:100,category:'Utilities',property_id:p.id}]});assert.equal(allocation.status,200,JSON.stringify(allocation));
  const expense=(await api('/api/property-expenses/'+p.id)).data.find(e=>e.bank_transaction_id===bank.id);assert(expense);
  assert.equal((await api('/api/property-expenses/'+expense.id,null,'DELETE')).status,409);
  assert((await api('/api/bank-feed/transactions?transaction='+bank.id)).data.some(b=>b.id===bank.id));
  assert((await api('/api/financial-summary')).data.vacancy_loss.periods);
 });
 console.log(`${passed} morning feedback integration checks passed`);
}finally{server.kill('SIGTERM');await db.end();}
