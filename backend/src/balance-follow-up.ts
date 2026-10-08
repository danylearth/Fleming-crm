import pool from './db-pg';

export async function saveBalanceFollowUp(ids:number[],date:string,notes:string|undefined,user:{id:number;name:string;email:string}){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const records=(await client.query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
  const enquiry=records[0];
  if(!enquiry)throw Error('Enquiry not found');
  if(records.some(row=>row.balance_payment_received))throw Error('The final balance has already been received');
  const savedNotes=notes===undefined?enquiry.balance_internal_notes||'':notes;
  await client.query('UPDATE tenant_enquiries SET balance_follow_up_date=$1,balance_internal_notes=$2,updated_at=NOW() WHERE id=ANY($3::int[])',[date,savedNotes,ids]);
  const tasks=(await client.query("SELECT id FROM tasks WHERE entity_type='tenant_enquiry' AND entity_id=ANY($1::int[]) AND task_type='follow_up' AND title LIKE 'Chase final tenancy balance%' AND status IN ('pending','in_progress') ORDER BY id FOR UPDATE",[ids])).rows;
  const title=`Chase final tenancy balance for ${enquiry.first_name_1} ${enquiry.last_name_1}`;
  const description='Check for payment and chase the outstanding final tenancy balance.'+(savedNotes?'\nInternal notes: '+savedNotes:'');
  if(tasks.length){
   await client.query('UPDATE tasks SET due_date=$1,description=$2,updated_at=NOW() WHERE id=$3',[date,description,tasks[0].id]);
   if(tasks.length>1)await client.query("UPDATE tasks SET status='completed',updated_at=NOW() WHERE id=ANY($1::int[])",[tasks.slice(1).map(t=>t.id)]);
  }else await client.query("INSERT INTO tasks(title,description,status,priority,entity_type,entity_id,due_date,task_type,assigned_to) VALUES($1,$2,'pending','high','tenant_enquiry',$3,$4,'follow_up',$5)",[title,description,enquiry.id,date,user.name||user.email]);
  await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'balance_followup_updated','tenant_enquiry',$3,$4)",[user.id,user.email,enquiry.id,JSON.stringify({follow_up_date:date,internal_notes:savedNotes})]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
