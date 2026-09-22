import type {Express} from 'express';
import {authMiddleware,type AuthRequest} from './auth';
import pool from './db-pg';
export function registerTenantReactivation(app:Express){
 app.post('/api/tenants/:id/reactivate',authMiddleware,async(req:AuthRequest,res)=>{
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const t=(await c.query('SELECT * FROM tenants WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!t){await c.query('ROLLBACK');return res.status(404).json({error:'Tenant not found'});}
   if(t.status!=='inactive'){await c.query('ROLLBACK');return res.status(409).json({error:'Only inactive tenants can return to the enquiry workflow'});}
   const live=(await c.query('SELECT id FROM properties WHERE tenant_id=$1 AND has_live_tenancy=1',[t.id])).rows[0];
   if(live){await c.query('ROLLBACK');return res.status(409).json({error:'End the active property service before reactivating this tenant'});}
   const existing=(await c.query("SELECT id FROM tenant_enquiries WHERE source_tenant_id=$1 AND status NOT IN ('converted','rejected','closed','archived','not_interested') ORDER BY id DESC LIMIT 1",[t.id])).rows[0];
   if(existing){await c.query('COMMIT');return res.json({enquiry_id:existing.id,existing:true});}
   const names=String(t.name||'').trim().split(/\s+/);
   const row=(await c.query(`INSERT INTO tenant_enquiries(source_tenant_id,title_1,first_name_1,last_name_1,email_1,phone_1,date_of_birth_1,current_address_1,status,notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'new',$9) RETURNING id`,[t.id,t.title_1,t.first_name_1||names[0],t.last_name_1||names.slice(1).join(' '),t.email,t.phone,t.date_of_birth_1,t.current_address,`Returning tenant. Previous tenant record #${t.id}; historic tenancy and documents retained there.`])).rows[0];
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'reactivate','tenant',$3,$4),($1,$2,'create','tenant_enquiry',$5,$4)",[req.user.id,req.user.email,t.id,JSON.stringify({source_tenant_id:t.id,enquiry_id:row.id}),row.id]);
   await c.query('COMMIT');res.status(201).json({enquiry_id:row.id});
  }catch(e){await c.query('ROLLBACK');res.status(500).json({error:'Could not return this tenant to enquiries'});}finally{c.release();}
 });
}
