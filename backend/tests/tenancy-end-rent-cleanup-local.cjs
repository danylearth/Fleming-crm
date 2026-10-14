const assert=require('node:assert/strict'),fs=require('fs');const u=new URL(process.env.DATABASE_URL);assert(['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname.startsWith('/fleming_crm_test'));
const pool=require('../dist/db-pg').default,one=async(s,p=[])=>(await pool.query(s,p)).rows[0];
(async()=>{try{
 const landlord=await one("INSERT INTO landlords(name,landlord_type) VALUES('Fictional Owner','internal') RETURNING id"),p=await one("INSERT INTO properties(address,postcode,landlord_id,status) VALUES('1 Cleanup Test Road','WV1 1AA',$1,'let') RETURNING id",[landlord.id]);
 const ids=[];for(const name of ['Joint One','Joint Two'])ids.push((await one("INSERT INTO tenants(name,first_name_1,last_name_1,property_id,status,tenancy_start_date,monthly_rent,rent_due_day,is_joint_tenancy) VALUES($1,$1,'Test',$2,'active','2026-02-06',1100,5,1) RETURNING id",[name,p.id])).id);
 await pool.query('UPDATE tenants SET linked_tenant_id=CASE WHEN id=$1 THEN $2 ELSE $1 END WHERE id=ANY($3::int[])',[...ids,ids]);
 const charge=async(date,person=ids[0],paid=0)=>one("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status) VALUES($1,$2,$3,1100,$4,'pending') RETURNING *",[p.id,person,date,paid]);
 const prior=await charge('2026-10-05',ids[0],300),boundary=await charge('2026-11-05'),later=await charge('2026-12-05'),paid=await charge('2026-11-05',ids[1],100),external=await charge('2026-12-05',ids[1]),chased=await charge('2026-11-05',ids[1]);
 await pool.query("UPDATE rent_payments SET freeagent_invoice_reference='external-test' WHERE id=$1",[external.id]);
 await pool.query("INSERT INTO rent_chaser_deliveries(rent_payment_id,channel,cycle_date,status) VALUES($1,'email','2026-10-14','sent')",[chased.id]);
 const doc=await one("INSERT INTO financial_documents(kind,source_key,tenant_id,property_id,rent_payment_id,snapshot) VALUES('rent_invoice',$1,$2,$3,$4,$5) RETURNING id",['rent:'+boundary.id,ids[0],p.id,boundary.id,JSON.stringify({amount:1100,recipient:'Joint One & Joint Two'})]);
 const oldProfile=await one("INSERT INTO tenancy_billing_profiles(property_id,tenant_id,tenant_ids,start_date,monthly_rent,rent_due_day,invoice_source) VALUES($1,$2,$3,'2026-02-06',1100,5,'{}') RETURNING id",[p.id,ids[0],ids]);
 const nextProfile=await one("INSERT INTO tenancy_billing_profiles(property_id,tenant_id,tenant_ids,start_date,monthly_rent,rent_due_day,invoice_source) VALUES($1,$2,$3,'2026-11-06',1100,6,'{}') RETURNING id",[p.id,ids[1],[ids[1]]]);
 const sole=await charge('2026-11-06',ids[1]),unattachedSole=await charge('2026-12-06',ids[1]);await pool.query('UPDATE rent_payments SET tenancy_profile_id=$2 WHERE id=$1',[sole.id,nextProfile.id]);
 // Explicit current-period profiles are still reviewed even after a new profile exists.
 await pool.query('UPDATE rent_payments SET tenancy_profile_id=$2 WHERE id=ANY($1::int[])',[[later.id,paid.id,external.id,chased.id],oldProfile.id]);
 const admin=await one("INSERT INTO users(name,email,password,role,is_active) VALUES('Test Admin','test@example.test','unused','admin',1) RETURNING *");
 const express=require('express'),app=express();app.use(express.json());require('../dist/tenancy-end').registerTenancyEndRoutes(app);const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 try{const headers={Authorization:'Bearer '+require('../dist/auth').generateToken(admin),'Content-Type':'application/json'};
 const schedule=async(preview=false,date='2026-11-05')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/tenants/'+ids[1]+'/tenancy-end',{method:'POST',headers,body:JSON.stringify({end_date:date,preview_only:preview,send_email:false,send_sms:false})});return {status:r.status,body:await r.json()};};
 assert.equal((await schedule(true)).status,200);assert(await one('SELECT id FROM rent_payments WHERE id=$1',[boundary.id]));
 const invalid=await schedule(false,'2025-01-01');assert.equal(invalid.status,400);assert(await one('SELECT id FROM rent_payments WHERE id=$1',[boundary.id]));
 const result=await schedule();assert.equal(result.status,200,JSON.stringify(result.body));assert.deepEqual(result.body.removed_rent_charges,[boundary.id,later.id]);assert.equal(result.body.billing_review.length,3);
 assert.equal(await one('SELECT id FROM rent_payments WHERE id=$1',[boundary.id]),undefined);assert.equal(await one('SELECT id FROM financial_documents WHERE id=$1',[doc.id]),undefined);
 assert.deepEqual(await one('SELECT * FROM rent_payments WHERE id=$1',[prior.id]),prior);
 for(const id of [paid.id,external.id,chased.id,sole.id,unattachedSole.id])assert(await one('SELECT id FROM rent_payments WHERE id=$1',[id]));
 assert.equal((await one('SELECT end_date FROM tenancy_billing_profiles WHERE id=$1',[oldProfile.id])).end_date,'2026-11-05');assert.equal((await one('SELECT end_date FROM tenancy_billing_profiles WHERE id=$1',[nextProfile.id])).end_date,null);
 const repeat=await schedule();assert.equal(repeat.body.removed_rent_charges.length,0);assert.equal((await one("SELECT COUNT(*)::int n FROM audit_log WHERE action='rent_charge_removed_not_due'")).n,2);
 await pool.query("UPDATE rent_tracking_settings SET cutover_date='2026-10-01' WHERE id=1");await require('../dist/finance-scheduler').runFinanceSchedule(new Date('2026-11-05T10:00:00Z'));await require('../dist/finance-scheduler').runFinanceSchedule(new Date('2026-11-05T10:01:00Z'));
 assert.equal((await one('SELECT COUNT(*)::int n FROM rent_payments WHERE tenant_id=$1 AND due_date >= $2',[ids[0],'2026-11-05'])).n,0);
 console.log('PASS end scheduling HTTP: preview/invalid date unchanged; obsolete unpaid charge and invoice deleted; repeat safe; audit retained');
 console.log('PASS accounting boundaries: historical arrears, paid charges, external invoices, delivery evidence and replacement tenancy billing preserved; warnings returned');
 console.log('PASS repeated scheduler: no end-date or later old-tenancy rent recreated');
 }finally{await new Promise(r=>server.close(r));}
}finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1});
