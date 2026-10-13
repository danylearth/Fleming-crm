import type {Express} from 'express';
import pool from './db-pg';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';

export function applicationAmountsValid(rent:unknown,deposit:unknown):boolean {
 const amount=(value:unknown)=>['string','number'].includes(typeof value)&&String(value).trim()!==''&&Number.isFinite(Number(value))&&/^\d+(\.\d{1,2})?$/.test(String(value).trim());
 return amount(rent)&&Number(rent)>0&&amount(deposit)&&Number(deposit)>=0;
}

// Only the draft application changes here. The active tenant and billing remain untouched.
export function registerApplicationProperty(app:Express){
 app.post('/api/tenant-enquiries/:id/application-amounts',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const {monthly_rent,security_deposit}=req.body;
  if(!applicationAmountsValid(monthly_rent,security_deposit))return res.status(400).json({error:'Enter the agreed monthly rent and security deposit. Enter 0 only if no security deposit is required.'});
  const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('tenancy-changeovers'))");
   const e=(await c.query('SELECT * FROM tenant_enquiries WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!e?.existing_tenancy_application)throw Error('Choose an existing tenant’s new application');
   const ids=[e.id,e.joint_partner_id].filter(Boolean);
   const applicants=(await c.query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
   if(applicants.some((a:any)=>!a.existing_tenancy_application||!a.linked_property_id||a.application_form_sent||a.application_form_completed||a.app_signature||['converted','rejected','closed','archived','not_interested'].includes(a.status)))throw Error('Amounts can only be confirmed before the new application is sent.');
   await c.query('UPDATE tenant_enquiries SET monthly_rent_agreed=$1,security_deposit_amount=$2,updated_at=NOW() WHERE id=ANY($3::int[])',[Number(monthly_rent),Number(security_deposit),ids]);
   for(const a of applicants)await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'application_amounts_confirmed','tenant_enquiry',$3,$4)",[req.user.id,req.user.email,a.id,JSON.stringify({monthly_rent:{before:a.monthly_rent_agreed,after:Number(monthly_rent)},security_deposit:{before:a.security_deposit_amount,after:Number(security_deposit)},current_tenancy_unchanged:true})]);
   await c.query('COMMIT');res.json({success:true});
  }catch(e){await c.query('ROLLBACK');res.status(409).json({error:(e as Error).message});}finally{c.release();}
 });
 app.post('/api/tenant-enquiries/:id/application-property',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const propertyId=Number(req.body.property_id);
  if(!Number.isSafeInteger(propertyId)||propertyId<1)return res.status(400).json({error:'Choose a property'});
  const c=await pool.connect();
  try{
   await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('tenancy-changeovers'))");
   const e=(await c.query('SELECT * FROM tenant_enquiries WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!e?.existing_tenancy_application)throw Error('Choose an existing tenant’s new application');
   const ids=[e.id,e.joint_partner_id].filter(Boolean);
   const applicants=(await c.query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
   if(applicants.some((a:any)=>!a.existing_tenancy_application||!a.source_tenant_id||['converted','rejected','closed','archived','not_interested'].includes(a.status)))throw Error('This application is no longer available for editing');
   if(applicants.every((a:any)=>Number(a.linked_property_id)===propertyId)){await c.query('COMMIT');return res.json({success:true,property_id:propertyId});}
   if(applicants.some((a:any)=>a.application_form_sent||a.application_form_completed||a.application_form_token))throw Error('The application has already been prepared or sent. Cancel it and start a new application before changing its property.');
   if((await c.query("SELECT id FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void'",[ids])).rowCount||(await c.query('SELECT id FROM tenancy_changeovers WHERE enquiry_id=ANY($1::int[])',[ids])).rowCount)throw Error('An agreement or tenancy changeover already exists for this application');
   const p=(await c.query('SELECT id,address,postcode,rent_amount,archived_at FROM properties WHERE id=$1 FOR SHARE',[propertyId])).rows[0];
   if(!p||p.archived_at)throw Error('Choose an available property');
   await c.query('UPDATE tenant_enquiries SET linked_property_id=$1,monthly_rent_agreed=$2,security_deposit_amount=NULL,updated_at=NOW() WHERE id=ANY($3::int[])',[propertyId,p.rent_amount,ids]);
   for(const a of applicants)await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'application_property_linked','tenant_enquiry',$3,$4)",[req.user.id,req.user.email,a.id,JSON.stringify({from:a.linked_property_id,to:propertyId,current_tenancy_unchanged:true})]);
   await c.query('COMMIT');res.json({success:true,property_id:propertyId});
  }catch(e){await c.query('ROLLBACK');res.status(409).json({error:(e as Error).message});}finally{c.release();}
 });
}
