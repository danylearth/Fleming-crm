import type {Express} from 'express';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import pool,{query,queryOne} from './db-pg';

export function nextInspectionDate(start:string,after?:string|null):string {
 const origin=new Date(start.slice(0,10)+'T12:00:00Z');
 if(!Number.isFinite(origin.getTime()))throw new Error('A valid tenancy start date is required');
 for(let index=0;index<200;index++){
  const months=index===0?3:6+(index-1)*12;
  const date=new Date(Date.UTC(origin.getUTCFullYear(),origin.getUTCMonth()+months,1,12));
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(origin.getUTCDate(),last));
  const due=date.toISOString().slice(0,10);if(!after||due>after.slice(0,10))return due;
 }
 throw new Error('Inspection date is outside the supported schedule');
}
export const hasPropertyInspections=(property:{landlord_type?:string;service_type?:string})=>property.landlord_type==='internal'||property.service_type==='full_management';
async function context(id:number){
 const property=await queryOne('SELECT p.id,p.address,l.landlord_type,p.service_type,p.archived_at FROM properties p LEFT JOIN landlords l ON l.id=p.landlord_id WHERE p.id=$1',[id]);
 if(!property)return null;
 const tenant=await queryOne("SELECT id,name,tenancy_start_date FROM tenants WHERE property_id=$1 AND status IN ('active','scheduled') AND tenancy_start_date IS NOT NULL ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,tenancy_start_date DESC,id LIMIT 1",[id]);
 const rows=await query('SELECT i.*,u.name AS conducted_by_name,d.original_name AS document_name FROM property_inspections i JOIN users u ON u.id=i.conducted_by LEFT JOIN documents d ON d.id=i.document_id WHERE i.property_id=$1 ORDER BY i.inspection_date DESC,i.id DESC',[id]);
 const current=tenant?rows.filter(i=>i.tenant_id===tenant.id&&String(i.tenancy_start_date).slice(0,10)===String(tenant.tenancy_start_date).slice(0,10)):[];
 return {property,tenant,enabled:hasPropertyInspections(property)&&!property.archived_at,inspections:rows,next_due:tenant?nextInspectionDate(String(tenant.tenancy_start_date),current.length?current.flatMap(i=>[String(i.inspection_date).slice(0,10),String(i.scheduled_due_date).slice(0,10)]).sort().pop():null):null};
}
export async function syncPropertyInspectionTasks(){
 const properties=await query("SELECT p.id FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE p.archived_at IS NULL AND (l.landlord_type='internal' OR p.service_type='full_management')");
 for(const property of properties){const state=await context(property.id);if(!state?.tenant||!state.next_due)continue;
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('property-inspection-'||$1::text))",[property.id]);
   await c.query("UPDATE tasks SET status='completed' WHERE task_type='property_inspection' AND entity_type='property' AND entity_id=$1 AND status IN ('pending','in_progress') AND due_date<>$2",[property.id,state.next_due]);
   await c.query("UPDATE tasks SET status='pending',dashboard_dismissed_at=NULL WHERE task_type='property_inspection' AND entity_type='property' AND entity_id=$1 AND due_date=$2 AND $2::date<=CURRENT_DATE AND status='completed'",[property.id,state.next_due]);
   await c.query(`WITH added AS (INSERT INTO tasks(title,description,priority,status,due_date,task_type,entity_type,entity_id)
    SELECT $1,$2,CASE WHEN $3::date<CURRENT_DATE THEN 'high' ELSE 'medium' END,'pending',$3,'property_inspection','property',$4
    WHERE $3::date<=CURRENT_DATE AND NOT EXISTS(SELECT 1 FROM tasks WHERE task_type='property_inspection' AND entity_id=$4 AND due_date=$3 AND status IN ('pending','in_progress')) ON CONFLICT DO NOTHING RETURNING id)
    INSERT INTO audit_log(action,entity_type,entity_id,changes) SELECT 'create','task',id,'{"source":"property inspection schedule"}' FROM added`,[`Property Inspection — ${state.property.address}`,`Inspect ${state.tenant.name}'s property and record the condition report.`,state.next_due,property.id]);
   await c.query("UPDATE tasks SET priority='high' WHERE task_type='property_inspection' AND entity_id=$1 AND status IN ('pending','in_progress') AND due_date<CURRENT_DATE",[property.id]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 await query("UPDATE tasks t SET status='completed' WHERE task_type='property_inspection' AND status IN ('pending','in_progress') AND NOT EXISTS(SELECT 1 FROM properties p JOIN landlords l ON l.id=p.landlord_id JOIN tenants ten ON ten.property_id=p.id AND ten.status IN ('active','scheduled') WHERE p.id=t.entity_id AND p.archived_at IS NULL AND (l.landlord_type='internal' OR p.service_type='full_management'))");
}
export function registerPropertyInspections(app:Express){
 app.get('/api/properties/:id/inspections',authMiddleware,async(req,res)=>{const state=await context(Number(req.params.id));if(!state)return res.sendStatus(404);res.json(state);});
 app.put('/api/properties/:id/inspections/:inspectionId',authMiddleware,requirePermission('admin'),async(req:AuthRequest,res)=>{
  const {inspection_date,condition,conducted_by,document_id}=req.body;
  const c=await pool.connect();try{await c.query('BEGIN');
   const before=(await c.query('SELECT * FROM property_inspections WHERE id=$1 AND property_id=$2 FOR UPDATE',[req.params.inspectionId,req.params.id])).rows[0];if(!before)throw Error('Inspection not found');
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());
   if(typeof inspection_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(inspection_date)||!Number.isFinite(Date.parse(inspection_date))||new Date(inspection_date).toISOString().slice(0,10)!==inspection_date||inspection_date>today||inspection_date<String(before.tenancy_start_date).slice(0,10))throw Error('Enter an actual inspection date within its tenancy, no later than today');
   if(!['bad','needs_repair','good','excellent'].includes(condition))throw Error('Choose a condition');
   if(!(await c.query("SELECT id FROM users WHERE id=$1 AND role IN ('staff','manager','admin')",[Number(conducted_by)||0])).rows.length)throw Error('Choose an office staff member');
   if(!(await c.query("SELECT id FROM documents WHERE id=$1 AND entity_type='property' AND entity_id=$2",[Number(document_id)||0,req.params.id])).rows.length)throw Error('Choose a report at this property');
   await c.query('UPDATE property_inspections SET inspection_date=$1,condition=$2,conducted_by=$3,document_id=$4,notes=$5 WHERE id=$6',[inspection_date,condition,conducted_by,document_id,String(req.body.notes||'').slice(0,4000),before.id]);
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','property_inspection',$3,$4)",[req.user.id,req.user.email,before.id,JSON.stringify({before,after:req.body})]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');res.status(400).json({error:(e as Error).message});return;}finally{c.release();}
  await syncPropertyInspectionTasks();res.json({success:true});
 });
 app.delete('/api/properties/:id/inspections/:inspectionId',authMiddleware,requirePermission('admin'),async(req:AuthRequest,res)=>{
  const c=await pool.connect();try{await c.query('BEGIN');
   const before=(await c.query('SELECT * FROM property_inspections WHERE id=$1 AND property_id=$2 FOR UPDATE',[req.params.inspectionId,req.params.id])).rows[0];if(!before)throw Error('Inspection not found');
   await c.query('DELETE FROM property_inspections WHERE id=$1',[before.id]);
   const document=(await c.query(`DELETE FROM documents d WHERE d.id=$1 AND d.entity_type='property' AND d.entity_id=$2 AND d.inventory_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM property_inspections i WHERE i.document_id=d.id)
    AND NOT EXISTS(SELECT 1 FROM property_expenses e WHERE e.receipt_document_id=d.id) RETURNING d.id,d.original_name,d.filename`,[before.document_id,req.params.id])).rows[0];
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'delete','property_inspection',$3,$4)",[req.user.id,req.user.email,before.id,JSON.stringify({before,removed_document:document||null})]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');res.status(400).json({error:(e as Error).message});return;}finally{c.release();}
  await syncPropertyInspectionTasks();res.json({success:true});
 });
 app.post('/api/properties/:id/inspections',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const state=await context(Number(req.params.id));if(!state)return res.sendStatus(404);if(!state.enabled||!state.tenant)return res.status(400).json({error:'Inspections require a Fleming-owned or fully managed property with a tenancy'});
  const {inspection_date,condition,conducted_by,document_id,notes}=req.body;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());
  if(typeof inspection_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(inspection_date)||!Number.isFinite(Date.parse(inspection_date))||new Date(inspection_date).toISOString().slice(0,10)!==inspection_date||inspection_date>today||inspection_date<String(state.tenant.tenancy_start_date).slice(0,10))return res.status(400).json({error:'Enter the actual inspection date within this tenancy, no later than today'});
  if(!['bad','needs_repair','good','excellent'].includes(condition)||!Number.isInteger(Number(conducted_by))||Number(conducted_by)<=0||!Number.isInteger(Number(document_id))||Number(document_id)<=0)return res.status(400).json({error:'Choose the staff member, condition and inspection report'});
  let savedId:number|undefined;const c=await pool.connect();try{await c.query('BEGIN');
   const staff=(await c.query("SELECT id FROM users WHERE id=$1 AND is_active=1 AND role IN ('staff','manager','admin')",[conducted_by])).rows[0];if(!staff)throw new Error('Choose an office staff member');
   const doc=(await c.query("SELECT id FROM documents WHERE id=$1 AND entity_type='property' AND entity_id=$2",[document_id,state.property.id])).rows[0];if(!doc)throw new Error('Upload or select a report for this property');
   const row=(await c.query('INSERT INTO property_inspections(property_id,tenant_id,tenancy_start_date,conducted_by,inspection_date,condition,document_id,notes,created_by,scheduled_due_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[state.property.id,state.tenant.id,state.tenant.tenancy_start_date,conducted_by,inspection_date,condition,document_id,String(notes||'').slice(0,4000),req.user.id,state.next_due])).rows[0];
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'inspection_completed','property',$3,$4)",[req.user.id,req.user.email,state.property.id,JSON.stringify({inspection_id:row.id,inspection_date,condition,conducted_by,document_id})]);await c.query('COMMIT');savedId=row.id;
  }catch(e:any){await c.query('ROLLBACK');res.status(400).json({error:e.code==='23505'?'An inspection is already recorded for this tenancy on this date':e.message||'Could not save inspection'});}finally{c.release();}
  if(savedId){await syncPropertyInspectionTasks();res.status(201).json({id:savedId});}
 });
}
