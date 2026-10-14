import type {Express} from 'express';
import fs from 'node:fs';
import path from 'node:path';
import pool from './db-pg';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import {dateOnly} from './tenant-lifecycle';
import {changeoverDates,validateChangeoverApplicants} from './tenancy-changeover-rules';
import {assertGuarantorsReady} from './guarantor-gates';
import {seedTenantApplication} from './tenant-application-prefill';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());
const json=(value:any)=>typeof value==='string'?JSON.parse(value):value||{};
async function audit(c:any,user:any,id:number,action:string,changes:any){
 await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,'tenant',$4,$5)",[user?.id||null,user?.email||'system@scheduler',action,id,JSON.stringify(changes)]);
}

// Called inside the conversion transaction. A repeat request returns the same
// changeover; a future agreement never overwrites the current tenant immediately.
export async function scheduleExistingTenancy(c:any,enquiryId:number,user:any,uploadsDir:string){
 await c.query("SELECT pg_advisory_xact_lock(hashtext('finance-daily'))");
 await c.query("SELECT pg_advisory_xact_lock(hashtext('tenancy-changeovers'))");
 const e=(await c.query('SELECT * FROM tenant_enquiries WHERE id=$1 FOR UPDATE',[enquiryId])).rows[0];
 if(!e?.source_tenant_id)throw Error('An existing tenant link is required');
 const prior=(await c.query('SELECT * FROM tenancy_changeovers WHERE enquiry_id=ANY($1::int[])',[[e.id,e.joint_partner_id].filter(Boolean)])).rows[0];
 if(prior)return {tenant_id:e.source_tenant_id,changeover_id:prior.id,status:prior.status};
 const ids=[e.id,e.joint_partner_id].filter(Boolean);
 const applicants=(await c.query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
 const agreement=(await c.query("SELECT * FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void' ORDER BY id DESC LIMIT 1 FOR UPDATE",[ids])).rows[0];
 if(!agreement)throw Error('Complete the tenancy agreement first');
 applicants.sort((a:any,b:any)=>a.id===agreement.enquiry_id?-1:b.id===agreement.enquiry_id?1:a.id-b.id);
 const property=(await c.query('SELECT p.*,l.landlord_type FROM properties p LEFT JOIN landlords l ON l.id=p.landlord_id WHERE p.id=$1 FOR UPDATE OF p',[agreement.property_id])).rows[0];
 const sources=applicants.map((a:any)=>Number(a.source_tenant_id));
 const existing=(await c.query("SELECT * FROM tenants WHERE (property_id=$1 AND status='active') OR id=ANY($2::int[]) ORDER BY id FOR UPDATE",[agreement.property_id,sources])).rows;
 const continuing=validateChangeoverApplicants(applicants,agreement,existing);
 if(!property||property.archived_at)throw Error('The agreement property is unavailable');
 if(existing.some((t:any)=>t.status!=='active'))throw Error('This changeover requires an active existing tenancy');
 if((await c.query("SELECT id FROM tenancy_changeovers WHERE status='scheduled' AND (property_id=$1 OR continuing_tenant_ids && $2::int[])",[property.id,continuing])).rowCount)throw Error('A tenancy changeover is already scheduled');
 if((await c.query("SELECT id FROM tenants WHERE property_id=$1 AND status='scheduled'",[property.id])).rowCount)throw Error('Another tenancy is already scheduled for this property');
 for(const a of applicants){
  if(!(await c.query("SELECT id FROM documents WHERE entity_type='tenant_enquiry' AND entity_id=$1 AND doc_type='Credit Check Report'",[a.id])).rowCount)throw Error('Upload each applicant’s credit check report');
  if(a.guarantor_required===null)throw Error('Confirm whether each applicant requires a guarantor');
  if(a.guarantor_required&&(await c.query("SELECT id FROM guarantor_verifications WHERE enquiry_id=$1 AND status='verified'",[a.id])).rowCount!==1)throw Error('Complete the guarantor checks and witnessed deed first');
 }
 await assertGuarantorsReady(c,ids,true);
 const guarantors=(await c.query("SELECT enquiry_id,name,COALESCE(form->>'email',email) AS email,COALESCE(form->>'phone',phone) AS phone,form->>'name' AS full_name,form->>'address' AS address,COALESCE(form->>'dob',form->>'date_of_birth') AS date_of_birth,COALESCE(form->>'employment',form->>'employment_status') AS employment_status,form->>'employer' AS employer,COALESCE(form->>'income',form->>'annual_income') AS annual_income FROM guarantor_verifications WHERE enquiry_id=ANY($1::int[]) AND status='verified'",[ids])).rows;
 const terms=json(agreement.agreement_details);
 const dates=changeoverDates(terms.tenancyStartDate,existing.map((t:any)=>dateOnly(t.tenancy_start_date)).sort().at(-1));
 if(dates.start<today())throw Error('Review a retrospective tenancy changeover with the office before completion');
 if(existing.some((t:any)=>t.has_end_date&&dateOnly(t.tenancy_end_date)!==dates.previousEnd))throw Error('The scheduled tenancy end date differs from the signed agreement’s changeover date');
 const rent=Number(terms.rent),deposit=Number(terms.deposit),dueDay=Number(terms.rentDueDay||dates.start.slice(8,10));
 if(!Number.isFinite(rent)||rent<=0||!Number.isFinite(deposit)||deposit<0||!Number.isInteger(dueDay)||dueDay<1||dueDay>31)throw Error('The signed agreement’s financial terms are invalid');
 const signedPath=path.resolve(uploadsDir,path.basename(agreement.signed_filename));
 if(!fs.existsSync(signedPath))throw Error('The completed agreement PDF is missing');
 const oldIds=existing.map((t:any)=>t.id);
 if((await c.query('SELECT id FROM rent_payments WHERE tenant_id=ANY($1::int[]) AND property_id=$2 AND due_date >= $3 AND (amount_due<>0 OR COALESCE(amount_paid,0)<>0)',[oldIds,property.id,dates.previousEnd])).rowCount)throw Error('Review existing rent charges on or after the final billing boundary before scheduling this changeover');
 const next={tenants:applicants.map((a:any)=>({tenant_id:a.source_tenant_id,enquiry_id:a.id,name:[a.first_name_1,a.last_name_1].filter(Boolean).join(' '),application:a,guarantor:a.guarantor_required?guarantors.find((g:any)=>g.enquiry_id===a.id):null})),terms,monthlyRent:rent,agreedDeposit:deposit,rentDueDay:dueDay};
 const row=(await c.query(`INSERT INTO tenancy_changeovers(enquiry_id,agreement_id,property_id,continuing_tenant_ids,previous_tenant_ids,start_date,previous_end_date,previous_snapshot,next_snapshot,created_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[e.id,agreement.id,property.id,continuing,oldIds,dates.start,dates.previousEnd,JSON.stringify(existing),JSON.stringify(next),user?.id||null])).rows[0];
 const old=existing[0];
 const oldAgreement=(await c.query("SELECT agreement_details FROM tenancy_agreements WHERE property_id=$1 AND id<>$2 AND status<>'void' AND (tenant_id=ANY($3::int[]) OR joint_tenant_id=ANY($3::int[])) ORDER BY id DESC LIMIT 1",[property.id,agreement.id,oldIds])).rows[0];
 const source=(people:any[],start:string,day:number,details:any)=>({name:people[0].name,joint_name:people[1]?.name||null,tenant_ids:people.map(t=>t.id),current_address:[property.address,property.postcode].filter(Boolean).join(', '),last_name_1:people[0].last_name_1,tenancy_start_date:start,rent_due_day:day,address:property.address,postcode:property.postcode,landlord_id:property.landlord_id,service_type:property.service_type,landlord_type:property.landlord_type,agreement_details:details});
 const oldSource=source(existing,dateOnly(old.tenancy_start_date),old.rent_due_day||Number(dateOnly(old.tenancy_start_date).slice(8,10)),json(oldAgreement?.agreement_details));
 const oldProfile=(await c.query(`INSERT INTO tenancy_billing_profiles(property_id,tenant_id,tenant_ids,start_date,end_date,monthly_rent,rent_due_day,invoice_source,changeover_id)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(property_id,tenant_id,start_date) DO UPDATE SET end_date=EXCLUDED.end_date RETURNING id`,[property.id,old.id,oldIds,oldSource.tenancy_start_date,dates.previousEnd,old.monthly_rent,oldSource.rent_due_day,JSON.stringify(oldSource),row.id])).rows[0];
 await c.query('UPDATE rent_payments SET tenancy_profile_id=$1 WHERE property_id=$2 AND tenant_id=ANY($3::int[]) AND tenancy_profile_id IS NULL AND due_date >= $4 AND due_date < $5',[oldProfile.id,property.id,oldIds,oldSource.tenancy_start_date,dates.start]);
 const people=continuing.map((id:number)=>existing.find((t:any)=>t.id===id));
 const newSource=source(people,dates.start,dueDay,terms);
 await c.query(`INSERT INTO tenancy_billing_profiles(property_id,tenant_id,tenant_ids,start_date,monthly_rent,rent_due_day,invoice_source,changeover_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[property.id,continuing[0],continuing,dates.start,rent,dueDay,JSON.stringify(newSource),row.id]);
 await c.query('UPDATE tenants SET has_end_date=1,tenancy_end_date=$1,updated_at=NOW() WHERE id=ANY($2::int[])',[dates.previousEnd,oldIds]);
 await c.query('UPDATE tenancy_agreements SET tenant_id=$1,joint_tenant_id=$2 WHERE id=$3',[continuing[0],continuing[1]||null,agreement.id]);
 for(const applicant of applicants){
  await c.query("UPDATE tenant_enquiries SET status='converted',updated_at=NOW() WHERE id=$1",[applicant.id]);
  await c.query(`INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,review_status)
   SELECT 'tenant',$1,'Signed Tenancy Agreement',$2,$3,'application/pdf',$4,'approved' WHERE NOT EXISTS(SELECT 1 FROM documents WHERE entity_type='tenant' AND entity_id=$1 AND filename=$2)`,[applicant.source_tenant_id,agreement.signed_filename,'Signed '+agreement.original_name,fs.statSync(signedPath).size]);
  await c.query(`INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,review_status)
   SELECT 'tenant',$1,d.doc_type,d.filename,d.original_name,d.mime_type,d.size,d.review_status FROM documents d
   WHERE d.entity_type='tenant_enquiry' AND d.entity_id=$2 AND NOT EXISTS(SELECT 1 FROM documents old WHERE old.entity_type='tenant' AND old.entity_id=$1 AND old.filename=d.filename)`,[applicant.source_tenant_id,applicant.id]);
  await audit(c,user,applicant.source_tenant_id,'tenancy_changeover_scheduled',{changeover_id:row.id,enquiry_id:applicant.id,start:dates.start,previous_end:dates.previousEnd});
 }
 return {tenant_id:e.source_tenant_id,partner_tenant_id:continuing.find((id:number)=>id!==e.source_tenant_id)||null,changeover_id:row.id,status:'scheduled'};
}

export async function applyDueTenancyChangeovers(businessDate=today()){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('tenancy-changeovers'))");
  const rows=(await c.query("SELECT * FROM tenancy_changeovers WHERE status='scheduled' AND start_date<=$1 ORDER BY start_date,id FOR UPDATE",[businessDate])).rows;
  for(const row of rows){
   await c.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE',[row.property_id]);
   const occupants=(await c.query("SELECT * FROM tenants WHERE (property_id=$1 AND status='active') OR id=ANY($2::int[]) ORDER BY id FOR UPDATE",[row.property_id,row.previous_tenant_ids])).rows;
   if(occupants.some((t:any)=>!row.previous_tenant_ids.includes(t.id)||t.property_id!==row.property_id||dateOnly(t.tenancy_end_date)!==dateOnly(row.previous_end_date)))throw Error('Scheduled tenancy changeover conflicts with updated occupants or end dates: '+row.id);
   const next=json(row.next_snapshot);
   await c.query("UPDATE tenants SET status='inactive',linked_tenant_id=NULL,is_joint_tenancy=0,updated_at=NOW() WHERE id=ANY($1::int[]) AND NOT(id=ANY($2::int[]))",[row.previous_tenant_ids,row.continuing_tenant_ids]);
   for(const id of row.previous_tenant_ids.filter((id:number)=>!row.continuing_tenant_ids.includes(id)))await audit(c,null,id,'tenancy_archived',{changeover_id:row.id,end:dateOnly(row.previous_end_date)});
   for(const person of next.tenants){
    const partner=row.continuing_tenant_ids.find((id:number)=>id!==person.tenant_id)||null;
    await c.query(`UPDATE tenants SET status='active',tenancy_start_date=$1,tenancy_end_date=NULL,has_end_date=0,tenancy_type='Assured Periodic Tenancy',monthly_rent=$2,rent_due_day=$3,source_enquiry_id=$4,linked_tenant_id=$5,is_joint_tenancy=$6,updated_at=NOW() WHERE id=$7`,[row.start_date,next.monthlyRent,next.rentDueDay,person.enquiry_id,partner,partner?1:0,person.tenant_id]);
    const application=person.application;
    if(application)await c.query(`UPDATE tenants SET name=$2,first_name_1=$3,last_name_1=$4,email=$5,phone=$6,date_of_birth_1=$7,
     income_contract_type=$8,income_employer=$9,income_amount=$10,income_frequency='annual',application_forms_completed=1,updated_at=NOW() WHERE id=$1`,[person.tenant_id,person.name,application.first_name_1,application.last_name_1,application.email_1,application.phone_1,application.app_form_data?.date_of_birth||application.date_of_birth_1||null,application.contract_type_1||null,application.employer_1||application.app_form_data?.employer_name||null,application.income_1||application.app_form_data?.gross_annual_income||null]);
    // Freeze the reviewed guarantor with this tenancy; never leave the previous
    // tenancy's guarantor displayed as the new sole tenancy's guarantor.
    if('guarantor' in person){const g=person.guarantor;
     await c.query(`UPDATE tenants SET guarantor_required=$2,guarantor_name=$3,guarantor_email=$4,guarantor_phone=$5,guarantor_address=$6,guarantor_date_of_birth=$7,guarantor_employment_status=$8,guarantor_employer=$9,guarantor_annual_income=$10,guarantor_kyc_completed=$2,guarantor_deed_received=$2,guarantor_primary_id=$2,guarantor_secondary_id=$2,guarantor_authority_to_contact=0 WHERE id=$1`,[person.tenant_id,g?1:0,g?.full_name||g?.name||null,g?.email||null,g?.phone||null,g?.address||null,g?.date_of_birth||null,g?.employment_status||null,g?.employer||null,g?.annual_income||null]);
    }
    await audit(c,null,person.tenant_id,'tenancy_changeover_activated',{changeover_id:row.id,start:dateOnly(row.start_date)});
   }
   await c.query("UPDATE tenancy_changeovers SET status='active',activated_at=NOW() WHERE id=$1",[row.id]);
  }
  await c.query('COMMIT');
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}

// Called in the tenant-edit transaction so the general record editor cannot
// bypass a signed changeover or leave an active billing period open.
export async function updateTenancyBillingForEdit(c:any,id:number,changes:any){
 await c.query("SELECT pg_advisory_xact_lock(hashtext('finance-daily'))");
 await c.query("SELECT pg_advisory_xact_lock(hashtext('tenancy-changeovers'))");
 const t=(await c.query('SELECT * FROM tenants WHERE id=$1 FOR UPDATE',[id])).rows[0];
 const profiles=(await c.query('SELECT id FROM tenancy_billing_profiles WHERE $1=ANY(tenant_ids)',[id])).rows;
 if(!t||!profiles.length)return;
 const changed=(key:string)=>key in changes&&(key==='is_joint_tenancy'?Boolean(changes[key])!==Boolean(t[key]):key==='tenancy_start_date'?dateOnly(changes[key])!==dateOnly(t[key]):String(changes[key]??'')!==String(t[key]??''));
 if(['property_id','tenancy_start_date','linked_tenant_id','is_joint_tenancy'].some(changed))throw Error('Use New Application to change this tenancy’s property, start date or tenants. Its billing history must be retained.');
 const transition=(await c.query("SELECT id,previous_end_date FROM tenancy_changeovers WHERE status='scheduled' AND $1=ANY(previous_tenant_ids)",[id])).rows[0];
 const end='has_end_date' in changes&&!changes.has_end_date?null:'tenancy_end_date' in changes?changes.tenancy_end_date||null:t.tenancy_end_date;
 if(transition&&(dateOnly(end)!==dateOnly(transition.previous_end_date)||changed('status')))throw Error('A signed replacement tenancy is scheduled. Retain its current tenancy and agreed end date until changeover.');
 if(end&&dateOnly(end)<dateOnly(t.tenancy_start_date))throw Error('The end date cannot be before the tenancy start date');
 if(t.linked_tenant_id&&dateOnly(end)!==dateOnly(t.tenancy_end_date))throw Error('Use Schedule Tenancy End to update both linked tenants together.');
 if(changes.status==='inactive'&&t.status!=='inactive'&&!end)throw Error('Schedule the tenancy end before archiving this tenant so billing stops on the correct date.');
 if(changes.status==='inactive'&&t.status!=='inactive'&&dateOnly(end)>=today())throw Error('The tenant remains active through the scheduled end date and will be archived automatically afterwards.');
 await c.query('UPDATE tenancy_billing_profiles SET end_date=$1 WHERE property_id=$2 AND $3=ANY(tenant_ids) AND start_date=$4',[end,t.property_id,id,dateOnly(t.tenancy_start_date)]);
}

export function registerTenancyChangeovers(app:Express){
 app.post('/api/tenant-enquiries/:id/cancel-new-application',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('tenancy-changeovers'))");
   const e=(await c.query('SELECT * FROM tenant_enquiries WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!e?.existing_tenancy_application)throw Error('Choose an existing tenant’s new application');
   const ids=[e.id,e.joint_partner_id].filter(Boolean);
   const rows=(await c.query('SELECT id,status,source_tenant_id,existing_tenancy_application FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
   if(rows.some((r:any)=>!r.existing_tenancy_application||r.status==='converted')||(await c.query('SELECT id FROM tenancy_changeovers WHERE enquiry_id=ANY($1::int[])',[ids])).rowCount)throw Error('This tenancy is already completed or scheduled. Review its signed agreement before making changes.');
   const agreements=(await c.query("SELECT * FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void' FOR UPDATE",[ids])).rows;
   if(agreements.some((a:any)=>a.status==='completed'||a.tenant_signed_at||a.joint_tenant_signed_at))throw Error('A tenant has signed the agreement. Review the signed agreement before cancelling this application.');
   await c.query("UPDATE tenancy_agreements SET status='void' WHERE enquiry_id=ANY($1::int[]) AND status<>'completed'",[ids]);
   const gs=(await c.query('SELECT id,execution_id FROM guarantor_verifications WHERE enquiry_id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
   const executions=gs.map((g:any)=>g.execution_id).filter(Boolean);
   if(executions.length){
    await c.query("UPDATE guarantor_executions SET witness_expires_at=NOW(),status=CASE WHEN status='completed' THEN status ELSE 'superseded' END WHERE id=ANY($1::bigint[])",[executions]);
    await c.query("UPDATE guarantor_execution_emails SET status='cancelled',last_error='Application cancelled' WHERE execution_id=ANY($1::bigint[]) AND status='pending'",[executions]);
   }
   await c.query("UPDATE guarantor_verifications SET token_hash=NULL,token_encrypted=NULL,expires_at=NOW(),updated_at=NOW() WHERE enquiry_id=ANY($1::int[])",[ids]);
   await c.query("UPDATE tenant_enquiries SET status='rejected',rejection_reason='Application cancelled by the office',application_form_token=NULL,application_form_slug=NULL,updated_at=NOW() WHERE id=ANY($1::int[])",[ids]);
   for(const row of rows)await audit(c,req.user,row.source_tenant_id,'new_tenancy_application_cancelled',{enquiry_id:row.id});
   await c.query('COMMIT');res.json({success:true});
  }catch(error){await c.query('ROLLBACK');res.status(409).json({error:error.message});}finally{c.release();}
 });

 app.get('/api/tenants/:id/onboarding-cycle',authMiddleware,async(req,res)=>{
  await applyDueTenancyChangeovers();
  const c=await pool.connect();try{
   const transition=(await c.query("SELECT id,enquiry_id,start_date,previous_end_date,status,continuing_tenant_ids,previous_tenant_ids,previous_snapshot,next_snapshot FROM tenancy_changeovers WHERE $1=ANY(previous_tenant_ids) ORDER BY id DESC LIMIT 1",[req.params.id])).rows[0];
   const draft=(await c.query("SELECT id FROM tenant_enquiries WHERE source_tenant_id=$1 AND status NOT IN ('converted','rejected','closed','archived','not_interested') ORDER BY id DESC LIMIT 1",[req.params.id])).rows[0];
   const previous=transition?.previous_snapshot||[],next=transition?.next_snapshot;
   res.json({enquiry_id:draft?.id||(transition?.status==='scheduled'&&transition.continuing_tenant_ids.includes(Number(req.params.id))?transition.enquiry_id:null),transition:transition?.status==='scheduled'?{
    id:transition.id,start_date:dateOnly(transition.start_date),previous_end_date:dateOnly(transition.previous_end_date),
    previous:{names:previous.map((t:any)=>t.name),monthlyRent:Number(previous[0]?.monthly_rent||0),rentDueDay:previous[0]?.rent_due_day||Number(dateOnly(previous[0]?.tenancy_start_date).slice(8,10))},
    next:{names:next.tenants.map((t:any)=>t.name),monthlyRent:next.monthlyRent,rentDueDay:next.rentDueDay},
    outgoingNames:previous.filter((t:any)=>!transition.continuing_tenant_ids.includes(t.id)).map((t:any)=>t.name)
   }:null});
  }finally{c.release();}
 });
 app.post('/api/tenants/:id/new-application',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  await applyDueTenancyChangeovers();
  const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('tenancy-changeovers'))");
   const t=(await c.query('SELECT * FROM tenants WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!t||t.status!=='active')throw Error('Choose an active tenant for a new tenancy application');
   if(!/^\S+@\S+\.\S+$/.test(t.email||''))throw Error('Save a valid tenant email address before starting a new application');
   if((await c.query("SELECT id FROM tenancy_changeovers WHERE status='scheduled' AND $1=ANY(previous_tenant_ids)",[t.id])).rowCount)throw Error('The scheduled tenancy must start before another application can begin');
   const draft=(await c.query("SELECT id FROM tenant_enquiries WHERE source_tenant_id=$1 AND status NOT IN ('converted','rejected','closed','archived','not_interested') ORDER BY id DESC LIMIT 1",[t.id])).rows[0];
   if(draft){await seedTenantApplication(c,t,draft.id,req.user);await c.query('COMMIT');return res.json({enquiry_id:draft.id,existing:true});}
   const names=String(t.name||'').trim().split(/\s+/);
   const row=(await c.query(`INSERT INTO tenant_enquiries(existing_tenancy_application,source_tenant_id,title_1,first_name_1,last_name_1,email_1,phone_1,date_of_birth_1,current_address_1,linked_property_id,monthly_rent_agreed,status,notes)
    VALUES(TRUE,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',$11) RETURNING id`,[t.id,t.title_1,t.first_name_1||names[0],t.last_name_1||names.slice(1).join(' '),t.email,t.phone,t.date_of_birth_1,t.current_address,t.property_id,t.monthly_rent,'New tenancy application. Previous applications and tenancy documents are retained in history.'])).rows[0];
   await seedTenantApplication(c,t,row.id,req.user);
   await audit(c,req.user,t.id,'new_tenancy_application',{enquiry_id:row.id});
   await c.query('COMMIT');res.status(201).json({enquiry_id:row.id});
  }catch(error){await c.query('ROLLBACK');res.status(409).json({error:error.message});}finally{c.release();}
 });
}
