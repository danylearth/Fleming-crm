const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=new URL(process.env.DATABASE_URL);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/fleming_crm_test'),'Dedicated local database required');
const pool=require('../dist/db-pg').default;
const {scheduleExistingTenancy,applyDueTenancyChangeovers,updateTenancyBillingForEdit}=require('../dist/tenancy-changeover');
const {runFinanceSchedule}=require('../dist/finance-scheduler');
const {rentInvoiceSource,rentInvoiceSnapshot}=require('../dist/financial-documents');
const one=async(sql,args=[])=>(await pool.query(sql,args)).rows[0];
(async()=>{try{
 const landlord=await one("INSERT INTO landlords(name,landlord_type) VALUES('Fictional Landlord','internal') RETURNING id");
 const p=await one("INSERT INTO properties(address,postcode,landlord_id,has_live_tenancy,status) VALUES('1 Test Road','WV1 1AA',$1,1,'let') RETURNING id",[landlord.id]);
 const ids=[];for(const name of ['Mathew Test','Zoe Test'])ids.push((await one("INSERT INTO tenants(name,first_name_1,last_name_1,property_id,status,tenancy_start_date,monthly_rent,rent_due_day,is_joint_tenancy) VALUES($1,split_part($1,' ',1),'Test',$2,'active','2026-02-06',1100,5,1) RETURNING id",[name,p.id])).id);
 await pool.query('UPDATE tenants SET linked_tenant_id=CASE WHEN id=$1 THEN $2 ELSE $1 END WHERE id=ANY($3::int[])',[ids[0],ids[1],ids]);
 const e=await one("INSERT INTO tenant_enquiries(source_tenant_id,first_name_1,last_name_1,email_1,phone_1,linked_property_id,status,application_form_completed,application_review_status,credit_check_completed,guarantor_required) VALUES($1,'Zoe','Test','zoe@example.test','07700900001',$2,'onboarding',1,'approved',1,false) RETURNING id",[ids[1],p.id]);
 await pool.query("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name) VALUES('tenant_enquiry',$1,'Credit Check Report','report.pdf','Fictional report.pdf')",[e.id]);
 const {PDFDocument}=require('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage();fs.writeFileSync(path.join(process.env.UPLOADS_PATH,'signed.pdf'),await pdf.save());
 const a=await one("INSERT INTO tenancy_agreements(tenant_token,enquiry_id,property_id,agreement_type,status,filename,signed_filename,original_name,agreement_details) VALUES('test-only-token',$1,$2,'internal','completed','signed.pdf','signed.pdf','Fictional Agreement.pdf',$3) RETURNING id",[e.id,p.id,JSON.stringify({tenancyStartDate:'2026-11-06',rent:1200,deposit:1100})]);
 const guarantee=await one("INSERT INTO guarantor_verifications(enquiry_id,name,email,phone,status,form,workflow) VALUES($1,'Frank Test','frank@example.test','07700900002','verified',$2,$3) RETURNING id",[e.id,JSON.stringify({name:'Frank Test',address:'2 Test Road',dob:'1960-01-01',employment:'Retired',employer:'None',income:30000}),JSON.stringify({reviewStatus:'approved',credit:{credit_check_completed:1}})]);
 const execution=await one("INSERT INTO guarantor_executions(verification_id,status,source_pdf,source_sha256,signature_fields,tenancy_snapshot,form_snapshot,signed_pdf) VALUES($1,'completed',$2,'fictional','{}','{}','{}',$2) RETURNING id",[guarantee.id,Buffer.from('fixture only')]);
 await pool.query('UPDATE guarantor_verifications SET execution_id=$2 WHERE id=$1',[guarantee.id,execution.id]);await pool.query('UPDATE tenant_enquiries SET guarantor_required=true WHERE id=$1',[e.id]);
 const oldPayment=await one("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status) VALUES($1,$2,'2026-10-05',1100,300,'partial') RETURNING id",[p.id,ids[0]]);
 // Reproduce the office scheduling the joint end before completing the new application.
 await pool.query("UPDATE tenants SET has_end_date=1,tenancy_end_date='2026-11-05' WHERE id=ANY($1::int[])",[ids]);
 const erroneous=await one("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status) VALUES($1,$2,'2026-11-05',1100,0,'pending') RETURNING id",[p.id,ids[0]]);
 const originalInvoice=await require('../dist/financial-documents').issueFinancialDocument('rent_invoice','rent:'+erroneous.id,rentInvoiceSnapshot(await rentInvoiceSource(erroneous.id)),{tenant_id:ids[0],property_id:p.id,rent_payment_id:erroneous.id},{id:null,email:'test@example.test'});
 const check=await pool.connect();try{
  await check.query('BEGIN');await assert.rejects(()=>scheduleExistingTenancy(check,e.id,null,process.env.UPLOADS_PATH),/final billing boundary/);await check.query('ROLLBACK');
  await check.query('BEGIN');await check.query('UPDATE rent_payments SET amount_paid=1 WHERE id=$1',[erroneous.id]);await assert.rejects(()=>require('../dist/rent-charge-correction').cancelUnpaidRentCharge(check,erroneous.id,'Test',{email:'test@example.test'}),/Reconcile payments/);await check.query('ROLLBACK');
  await check.query('BEGIN');await require('../dist/rent-charge-correction').cancelUnpaidRentCharge(check,erroneous.id,'No rent due on checkout date',{email:'test@example.test'});await check.query('COMMIT');
 }finally{check.release();}
 const cancelledInvoice=await one('SELECT * FROM financial_documents WHERE id=$1',[originalInvoice.id]);
 assert.equal(cancelledInvoice.snapshot.amount,1100);assert(cancelledInvoice.snapshot.cancelled_at);assert.equal(Number((await one('SELECT amount_due FROM rent_payments WHERE id=$1',[erroneous.id])).amount_due),0);
 fs.writeFileSync(path.join(process.env.UPLOADS_PATH,'cancelled-invoice.pdf'),await require('../dist/financial-document-pdf').financialDocumentPdf(cancelledInvoice));
 const c=await pool.connect();let result;
 try{await c.query('BEGIN');result=await scheduleExistingTenancy(c,e.id,null,process.env.UPLOADS_PATH);await c.query('COMMIT');await c.query('BEGIN');const repeat=await scheduleExistingTenancy(c,e.id,null,process.env.UPLOADS_PATH);assert.equal(repeat.changeover_id,result.changeover_id);await c.query('COMMIT');}finally{c.release();}
 assert.equal(result.tenant_id,ids[1]);assert.equal((await one('SELECT COUNT(*)::int n FROM tenants')).n,2);assert.equal((await one('SELECT COUNT(*)::int n FROM tenancy_changeovers')).n,1);
 const profiles=(await pool.query('SELECT * FROM tenancy_billing_profiles ORDER BY start_date')).rows;
 assert.deepEqual(profiles[0].tenant_ids,ids);assert.equal(profiles[0].end_date,'2026-11-05');assert.deepEqual(profiles[1].tenant_ids,[ids[1]]);assert.equal(profiles[1].start_date,'2026-11-06');
 assert.equal((await one('SELECT status FROM tenant_enquiries WHERE id=$1',[e.id])).status,'converted');
 const admin=await one("INSERT INTO users(name,email,password,role,is_active) VALUES('End tester','end@example.test','not-used','admin',1) RETURNING id,name,email,role");
 async function scheduleEnd(endDate){
  const express=require('express'),app=express();app.use(express.json());require('../dist/tenancy-end').registerTenancyEndRoutes(app);
  const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/tenants/'+ids[1]+'/tenancy-end',{method:'POST',headers:{Authorization:'Bearer '+require('../dist/auth').generateToken(admin),'Content-Type':'application/json'},body:JSON.stringify({end_date:endDate,send_email:false,send_sms:false})});return {status:response.status,body:await response.json()};}finally{await new Promise(resolve=>server.close(resolve));}
 }
 assert.equal((await scheduleEnd('2026-11-04')).status,409,'A conflicting end date must not change a signed replacement tenancy');
 async function editBilling(changes){const client=await pool.connect();try{await client.query('BEGIN');await updateTenancyBillingForEdit(client,ids[1],changes);}finally{await client.query('ROLLBACK');client.release();}}
 await assert.rejects(()=>editBilling({has_end_date:0}),/signed replacement tenancy/);
 await assert.rejects(()=>editBilling({status:'inactive'}),/signed replacement tenancy/);
 await assert.rejects(()=>editBilling({tenancy_start_date:'2026-03-01'}),/Use New Application/);
 await editBilling({monthly_rent:1100});
 await applyDueTenancyChangeovers('2026-11-05');assert.equal((await one('SELECT status FROM tenants WHERE id=$1',[ids[0]])).status,'active');
 const before=rentInvoiceSnapshot(await rentInvoiceSource(oldPayment.id));assert.equal(before.recipient,'Mathew Test & Zoe Test');
 await applyDueTenancyChangeovers('2026-11-06');await applyDueTenancyChangeovers('2026-11-08');
 const zoe=await one('SELECT * FROM tenants WHERE id=$1',[ids[1]]),mathew=await one('SELECT * FROM tenants WHERE id=$1',[ids[0]]);
 assert.equal(zoe.guarantor_date_of_birth,'1960-01-01');assert.equal(Number(zoe.guarantor_annual_income),30000);assert.equal(zoe.guarantor_name,'Frank Test');assert.equal(zoe.guarantor_required,1);assert.equal(zoe.guarantor_deed_received,1);assert.equal(zoe.source_enquiry_id,e.id);assert.equal(zoe.is_joint_tenancy,0);assert.equal(mathew.linked_tenant_id,null);assert.equal(zoe.status,'active');assert.equal(zoe.tenancy_start_date,'2026-11-06');assert.equal(zoe.linked_tenant_id,null);assert.equal(Number(zoe.monthly_rent),1200);assert.equal(zoe.rent_due_day,6);assert.equal(mathew.status,'inactive');assert.equal(mathew.tenancy_end_date,'2026-11-05');
 await assert.rejects(()=>editBilling({status:'inactive'}),/Schedule the tenancy end/);
 await assert.rejects(()=>editBilling({status:'inactive',has_end_date:1,tenancy_end_date:'2026-12-05'}),/archived automatically/);
 assert.deepEqual(rentInvoiceSnapshot(await rentInvoiceSource(oldPayment.id)),before);assert.equal(Number((await one('SELECT amount_paid FROM rent_payments WHERE id=$1',[oldPayment.id])).amount_paid),300);
 await pool.query("INSERT INTO rent_tracking_settings(id,cutover_date) VALUES(1,'2026-10-01') ON CONFLICT(id) DO UPDATE SET cutover_date=EXCLUDED.cutover_date");
 await pool.query("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status) VALUES($1,$2,'2026-11-06',1200,0,'pending')",[p.id,ids[1]]);
 await runFinanceSchedule(new Date('2026-11-06T10:00:00Z'));await runFinanceSchedule(new Date('2026-11-06T10:01:00Z'));
 const charges=(await pool.query('SELECT * FROM rent_payments WHERE amount_due>0 ORDER BY due_date')).rows;
 const indexSource=fs.readFileSync(path.join(__dirname,'../src/index-pg.ts'),'utf8');
 for(const route of ["app.get('/api/rent-payments',","app.get('/api/rent-payments/:id',"]){const section=indexSource.slice(indexSource.indexOf(route));const queryStart=section.indexOf('await query('),tick=String.fromCharCode(96),open=section.indexOf(tick,queryStart),close=section.indexOf(tick,open+1),statement=section.slice(open+1,close);const rows=(await pool.query(statement,statement.includes('$1')?[oldPayment.id]:[])).rows;assert.equal(rows.find(row=>row.id===oldPayment.id).tenant_name,'Mathew Test & Zoe Test');}
 assert.equal(charges.length,2);assert.equal(charges[1].due_date,'2026-11-06');assert.equal(charges[1].tenant_id,ids[1]);assert.equal(Number(charges[1].amount_due),1200);
 assert(charges[1].tenancy_profile_id,'A manually entered charge must be attached to its billing profile, not duplicated');
 assert.equal(rentInvoiceSnapshot(await rentInvoiceSource(charges[1].id)).recipient,'Zoe Test');
 assert.equal((await one("SELECT COUNT(*)::int n FROM audit_log WHERE action='tenancy_changeover_activated'")).n,1);
 const ended=await scheduleEnd('2026-12-05');assert.equal(ended.status,200,JSON.stringify(ended.body));
 assert.equal((await one('SELECT end_date FROM tenancy_billing_profiles WHERE id=$1',[charges[1].tenancy_profile_id])).end_date,'2026-12-05');
 await runFinanceSchedule(new Date('2026-12-06T10:00:00Z'));
 assert.equal((await one('SELECT COUNT(*)::int n FROM rent_payments WHERE amount_due>0')).n,2,'No new rent after the replacement tenancy ends');
 const user=await one("INSERT INTO users(name,email,password,role,is_active) VALUES('Local tester','tester@example.test','not-used','admin',1) RETURNING id,name,email,role");
 await pool.query("UPDATE tenants SET email='zoe@example.test',phone='07700900001' WHERE id=$1",[ids[1]]);
 const express=require('express'),app=express();app.use(express.json());require('../dist/tenancy-changeover').registerTenancyChangeovers(app);require('../dist/financial-documents').registerFinancialDocuments(app);
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 try{const token=require('../dist/auth').generateToken(user),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'},base='http://127.0.0.1:'+server.address().port;
 const cancelledResponse=await fetch(base+'/api/rent-payments/'+erroneous.id+'/invoice',{method:'POST',headers,body:'{}'});assert.equal(cancelledResponse.status,200);assert((await cancelledResponse.json()).snapshot.cancelled_at);
 const oldInvoice=await require('../dist/financial-documents').issueFinancialDocument('rent_invoice','rent:'+oldPayment.id,before,{tenant_id:ids[0],property_id:p.id,rent_payment_id:oldPayment.id},user);
 for(const person of ids){const response=await fetch(base+'/api/financial-documents/records/tenant/'+person,{headers});assert.equal(response.status,200);assert((await response.json()).some(row=>row.id===oldInvoice.id));}
 const cycle=await fetch(base+'/api/tenants/'+ids[1]+'/onboarding-cycle',{headers});assert.deepEqual(await cycle.json(),{enquiry_id:null,transition:null});
 let created;for(let i=0;i<2;i++){const response=await fetch(base+'/api/tenants/'+ids[1]+'/new-application',{method:'POST',headers,body:'{}'});assert.equal(response.status,i?200:201);const value=await response.json();if(i)assert.equal(value.enquiry_id,created);else created=value.enquiry_id;}
 const fresh=await one('SELECT * FROM tenant_enquiries WHERE id=$1',[created]);assert.equal(fresh.application_form_completed,0);assert.equal(fresh.credit_check_completed,0);assert.equal(fresh.source_tenant_id,ids[1]);assert.equal((await one('SELECT status FROM tenancy_agreements WHERE id=$1',[a.id])).status,'completed');
 const tenantBeforeCancel=await one('SELECT * FROM tenants WHERE id=$1',[ids[1]]);
 await pool.query("UPDATE tenant_enquiries SET application_form_token='cancel-test-token',application_form_slug='cancel-test-slug' WHERE id=$1",[created]);
 const cancel=()=>fetch(base+'/api/tenant-enquiries/'+created+'/cancel-new-application',{method:'POST',headers,body:'{}'});
 const cancelResult=await cancel();assert.equal(cancelResult.status,200,await cancelResult.text());assert.equal((await cancel()).status,200);
 const cancelled=await one('SELECT status,application_form_token,application_form_slug FROM tenant_enquiries WHERE id=$1',[created]);assert.equal(cancelled.status,'rejected');assert.equal(cancelled.application_form_token,null);assert.equal(cancelled.application_form_slug,null);
 assert.deepEqual(await one('SELECT * FROM tenants WHERE id=$1',[ids[1]]),tenantBeforeCancel);
 assert.equal((await (await fetch(base+'/api/tenants/'+ids[1]+'/onboarding-cycle',{headers})).json()).enquiry_id,null);
 const restarted=await fetch(base+'/api/tenants/'+ids[1]+'/new-application',{method:'POST',headers,body:'{}'});assert.equal(restarted.status,201);assert.notEqual((await restarted.json()).enquiry_id,created);
 console.log('PASS cancellation: old links revoked, current tenancy unchanged, history retained, fresh application allowed');
 await pool.query("UPDATE users SET role='viewer' WHERE id=$1",[user.id]);assert.equal((await fetch(base+'/api/tenants/'+ids[1]+'/new-application',{method:'POST',headers,body:'{}'})).status,403);
 console.log('PASS authenticated HTTP: historic joint invoices visible to both tenants, completed cycle closes, fresh application is idempotent, viewer writes blocked');
 }finally{await new Promise(resolve=>server.close(resolve));}
 console.log('PASS checkout cancellation: original invoice retained and marked cancelled, zero balance, no recreated November 5 charge');
 console.log('PASS real PostgreSQL: idempotent completion, no duplicate tenant, 5/6 November rollover, retained joint invoice/arrears, sole billing and repeat scheduler');
}finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1});

