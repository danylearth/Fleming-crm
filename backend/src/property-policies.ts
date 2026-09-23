import type {Express} from 'express';
import pool,{query,queryOne} from './db-pg';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
const validDate=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function allocateAnnualCost(amount:number,ids:number[]){
 const cents=Math.round(amount*100),share=Math.floor(cents/ids.length),remainder=cents%ids.length;
 return ids.map((property_id,index)=>({property_id,amount:(share+(index<remainder?1:0))/100}));
}
export function registerPropertyPolicies(app:Express){
 app.get('/api/properties/:id/policies',authMiddleware,async(req,res)=>{
  res.json(await query(`SELECT p.*,a.allocated_cost,a.sum_insured,(SELECT json_agg(json_build_object('id',pr.id,'address',pr.address,'allocated_cost',pa.allocated_cost,'sum_insured',pa.sum_insured)) FROM property_policy_allocations pa JOIN properties pr ON pr.id=pa.property_id WHERE pa.policy_id=p.id) AS properties FROM property_policies p JOIN property_policy_allocations a ON a.policy_id=p.id WHERE a.property_id=$1 ORDER BY p.expiry_date DESC`,[req.params.id]));
 });
 const save=async(req:AuthRequest,res:any)=>{
  const d=req.body;const ids=Array.isArray(d.property_ids)?[...new Set<number>(d.property_ids.map(Number))].sort((a,b)=>a-b):[Number(req.params.id)];
  if(!ids.length||ids.length>200||!ids.includes(Number(req.params.id))||ids.some(id=>!Number.isSafeInteger(id)||id<1)||!['rent_protection','buildings'].includes(d.policy_type)||!Number.isFinite(Number(d.annual_cost))||Number(d.annual_cost)<0||!validDate(d.commencement_date)||!validDate(d.expiry_date)||d.expiry_date<d.commencement_date)return res.status(400).json({error:'Choose covered properties, policy type, annual cost and valid coverage dates.'});
  if(d.cost_included_in_service_charge && Number(d.annual_cost)!==0)return res.status(400).json({error:'Insurance included in a service charge must not add a separate annual cost.'});
  for(const key of ['policy_number','broker_name','broker_phone','broker_email','insurer','broker_company'])if(d[key]&&String(d[key]).length>240)return res.status(400).json({error:'Policy and broker details must be under 240 characters.'});
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const properties=(await c.query("SELECT p.id FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE p.id=ANY($1::int[]) AND l.landlord_type='internal' AND p.archived_at IS NULL",[ids])).rows;
   if(properties.length!==ids.length){await c.query('ROLLBACK');return res.status(400).json({error:'Choose active properties in Our Portfolio.'});}
   const before=req.params.policyId?(await c.query('SELECT * FROM property_policies WHERE id=$1 FOR UPDATE',[req.params.policyId])).rows[0]:null;
   if(req.params.policyId&&(!before||!(await c.query('SELECT 1 FROM property_policy_allocations WHERE policy_id=$1 AND property_id=$2',[before.id,req.params.id])).rows.length)){await c.query('ROLLBACK');return res.status(404).json({error:'Policy not found at this property'});}
   const oldAllocations=before?(await c.query('SELECT * FROM property_policy_allocations WHERE policy_id=$1',[before.id])).rows:[];
   const oldCosts=before?(await c.query('SELECT * FROM property_expenses WHERE policy_id=$1 FOR UPDATE',[before.id])).rows:[];
   const policy=before?(await c.query('UPDATE property_policies SET policy_type=$1,policy_number=$2,annual_cost=$3,commencement_date=$4,expiry_date=$5,broker_name=$6,broker_phone=$7,broker_email=$8,insurer=$9,broker_company=$10,cost_included_in_service_charge=$11 WHERE id=$12 RETURNING *',[d.policy_type,d.policy_number||null,Number(d.annual_cost),d.commencement_date,d.expiry_date,d.broker_name||null,d.broker_phone||null,d.broker_email||null,d.insurer||null,d.broker_company||null,Boolean(d.cost_included_in_service_charge),before.id])).rows[0]:(await c.query('INSERT INTO property_policies(policy_type,policy_number,annual_cost,commencement_date,expiry_date,broker_name,broker_phone,broker_email,created_by,insurer,broker_company,cost_included_in_service_charge) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[d.policy_type,d.policy_number||null,Number(d.annual_cost),d.commencement_date,d.expiry_date,d.broker_name||null,d.broker_phone||null,d.broker_email||null,req.user.id,d.insurer||null,d.broker_company||null,Boolean(d.cost_included_in_service_charge)])).rows[0];
   if(before){await c.query('DELETE FROM property_policy_allocations WHERE policy_id=$1',[before.id]);await c.query('UPDATE property_expenses SET excluded_from_costs=TRUE WHERE policy_id=$1',[before.id]);}
   const label=d.policy_type==='buildings'?'Buildings Insurance':'Rent Protection';
   for(const a of allocateAnnualCost(Number(d.annual_cost),ids)){
    await c.query('INSERT INTO property_policy_allocations(policy_id,property_id,allocated_cost,sum_insured) VALUES($1,$2,$3,$4)',[policy.id,a.property_id,a.amount,oldAllocations.find(x=>x.property_id===a.property_id)?.sum_insured||null]);
    const existing=oldCosts.find(e=>e.property_id===a.property_id);
    if(!d.cost_included_in_service_charge&&existing)await c.query("UPDATE property_expenses SET description=$1,amount=$2,expense_date=$3,coverage_start=$3,coverage_end=$4,payee=$5,excluded_from_costs=FALSE,updated_at=NOW() WHERE id=$6",[`${label}${d.policy_number?' — '+d.policy_number:''}`,a.amount,d.commencement_date,d.expiry_date,d.broker_name||null,existing.id]);
    if(!d.cost_included_in_service_charge&&!existing)await c.query("INSERT INTO property_expenses(property_id,description,amount,category,expense_date,is_recurring,recurrence_frequency,policy_id,coverage_start,coverage_end,payee) VALUES($1,$2,$3,'insurance',$4,0,NULL,$5,$4,$6,$7)",[a.property_id,`${label}${d.policy_number?' — '+d.policy_number:''}`,a.amount,d.commencement_date,policy.id,d.expiry_date,d.broker_name||null]);
   }
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','property_policy',$3,$4)",[req.user.id,req.user.email,policy.id,JSON.stringify({action:before?'policy_edited':'policy_created',before,previous_costs:oldCosts,property_ids:ids,policy})]);
   await c.query('COMMIT');res.status(before?200:201).json(policy);
  }catch(error){await c.query('ROLLBACK');res.status(500).json({error:'Policy could not be saved.'});}finally{c.release();}
 };
 app.post('/api/properties/:id/policies',authMiddleware,requirePermission('staff'),save);
 app.put('/api/properties/:id/policies/:policyId',authMiddleware,save);
}
