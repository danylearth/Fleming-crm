const assert=require('assert/strict'),path=require('path');
const base=process.env.TEST_BACKEND_ROOT||path.resolve(__dirname,'..');
const url=new URL(process.env.DATABASE_URL);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/fleming_crm_test_'));
const pool=require(path.join(base,'dist/db-pg')).default,express=require('express');
const {registerApplicationProperty,applicationAmountsValid}=require(path.join(base,'dist/application-property'));
const one=async(sql,args=[])=>(await pool.query(sql,args)).rows[0];
(async()=>{let server,api;try{
 for(const value of [null,undefined,'',' ',false,-1,'abc',Infinity,'1.001'])assert.equal(applicationAmountsValid(1100,value),false);
 assert(applicationAmountsValid('1100.00','0.00'));assert(applicationAmountsValid(1100,1100));assert(!applicationAmountsValid(0,1100));
 const admin=await one("INSERT INTO users(name,email,password,role,is_active) VALUES('Tester','amounts@example.test','not-used','admin',1) RETURNING id,name,email,role");
 const landlord=await one("INSERT INTO landlords(name,landlord_type) VALUES('Fictional Landlord','internal') RETURNING id");
 const p=await one("INSERT INTO properties(address,postcode,rent_amount,status,landlord_id) VALUES('1 Test Street','WV1 1AA',1100,'to_let',$1) RETURNING id",[landlord.id]);
 const t=await one("INSERT INTO tenants(name,first_name_1,last_name_1,email,property_id,status,monthly_rent,security_deposit_amount,tenancy_type) VALUES('Fictional Tenant','Fictional','Tenant','tenant@example.test',$1,'active',1000,1000,'Assured Periodic Tenancy') RETURNING *",[p.id]);
 const make=()=>one("INSERT INTO tenant_enquiries(existing_tenancy_application,source_tenant_id,first_name_1,last_name_1,email_1,linked_property_id,monthly_rent_agreed,status,app_form_data) VALUES(TRUE,$1,'Fictional','Tenant','tenant@example.test',$2,1100,'new','{\"deposit_amount\":\"\",\"first_name\":\"Fictional\"}') RETURNING *",[t.id,p.id]);
 const e=await make(),partner=await make();
 await pool.query('UPDATE tenant_enquiries SET joint_partner_id=$1 WHERE id=$2',[partner.id,e.id]);await pool.query('UPDATE tenant_enquiries SET joint_partner_id=$1 WHERE id=$2',[e.id,partner.id]);
 const app=express();app.use(express.json());registerApplicationProperty(app);
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const endpoint='http://127.0.0.1:'+server.address().port+'/api/tenant-enquiries/'+e.id+'/application-amounts';
 const headers={Authorization:'Bearer '+require(path.join(base,'dist/auth')).generateToken(admin),'Content-Type':'application/json'};
 api=require('child_process').spawn(process.execPath,['dist/index-pg.js'],{cwd:base,env:{...process.env,PORT:'3372'},stdio:'ignore'});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3372/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,'Local API starts');
 for(const suffix of ['send-application-email/email-preview','send-application-email']){const r=await fetch('http://127.0.0.1:3372/api/tenant-enquiries/'+e.id+'/'+suffix,{method:'POST',headers,body:JSON.stringify({send_email:true,send_sms:true})});assert.equal(r.status,409);assert((await r.json()).error.includes('Confirm the agreed monthly rent'));}
 const blocked=await one('SELECT application_form_token,application_form_sent FROM tenant_enquiries WHERE id=$1',[e.id]);assert(!blocked.application_form_token&&!blocked.application_form_sent);
 assert.equal((await one('SELECT count(*)::int n FROM email_messages')).n,0);assert.equal((await one('SELECT count(*)::int n FROM sms_messages')).n,0);
 const post=async body=>{const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 assert.equal((await post({monthly_rent:1100,security_deposit:''})).status,400);
 assert.equal((await post({monthly_rent:1100,security_deposit:1100})).status,200);
 for(const id of [e.id,partner.id]){const row=await one('SELECT * FROM tenant_enquiries WHERE id=$1',[id]);assert.equal(Number(row.security_deposit_amount),1100);assert.equal(Number(row.monthly_rent_agreed),1100);assert.deepEqual(row.app_form_data,e.app_form_data);assert(!row.application_form_sent&&!row.application_form_completed&&!row.app_signature);assert.equal(row.status,'new');}
 assert.deepEqual(await one('SELECT * FROM tenants WHERE id=$1',[t.id]),t);
 assert.equal((await one("SELECT count(*)::int n FROM audit_log WHERE action='application_amounts_confirmed'")).n,2);
 assert.equal((await post({monthly_rent:1100,security_deposit:0})).status,200);
 await pool.query('UPDATE tenant_enquiries SET application_form_sent=1 WHERE id=$1',[partner.id]);
 assert.equal((await post({monthly_rent:1200,security_deposit:1200})).status,409);
 assert.equal(Number((await one('SELECT security_deposit_amount FROM tenant_enquiries WHERE id=$1',[e.id])).security_deposit_amount),0);
 await pool.query("UPDATE users SET role='viewer' WHERE id=$1",[admin.id]);assert.equal((await post({monthly_rent:1100,security_deposit:1100})).status,403);
 console.log('PASS amounts: blank/invalid blocked, preview/send rejected before token or messages, explicit zero allowed, both joint applicants saved and audited, sent partner locks edits, current tenancy/draft/signature/status unchanged, viewer denied.');
 }finally{if(api)api.kill();if(server)await new Promise(r=>server.close(r));await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1});
