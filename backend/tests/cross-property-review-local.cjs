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
 const oldPayment=await one("INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status) VALUES($1,$2,'2026-10-05',1100,300,'partial') RETURNING id",[p.id,ids[0]]);

 const destination=await one("INSERT INTO properties(address,postcode,landlord_id,has_live_tenancy,status) VALUES('2 Destination Road','WV1 1AA',$1,0,'to_let') RETURNING id",[landlord.id]);
 await pool.query('UPDATE tenant_enquiries SET linked_property_id=$1 WHERE id=$2',[destination.id,e.id]);
 await pool.query('UPDATE tenancy_agreements SET property_id=$1 WHERE id=$2',[destination.id,a.id]);
 const beforeTenants=(await pool.query('SELECT * FROM tenants ORDER BY id')).rows;
 const beforePayments=(await pool.query('SELECT * FROM rent_payments ORDER BY id')).rows;
 const c=await pool.connect();let message;
 try{await c.query('BEGIN');await scheduleExistingTenancy(c,e.id,null,process.env.UPLOADS_PATH);}catch(err){message=err.message;}finally{await c.query('ROLLBACK');c.release();}
 assert.equal(message,'End the continuing tenant’s other property tenancy before this changeover');
 assert.deepEqual((await pool.query('SELECT * FROM tenants ORDER BY id')).rows,beforeTenants);
 assert.deepEqual((await pool.query('SELECT * FROM rent_payments ORDER BY id')).rows,beforePayments);
 assert.equal((await one('SELECT count(*)::int n FROM tenancy_changeovers')).n,0);
 assert.equal((await one('SELECT count(*)::int n FROM tenancy_billing_profiles')).n,0);
 console.log('CONFIRMED cross-property completion still blocked: '+message);
 console.log('PASS rejection preserves old tenant records, arrears and payments; no changeover or billing profiles created.');
}finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1});
