import type {PoolClient} from 'pg';

const title='Office Approval: Confirm Landlord Bank Details';

// Call inside the bank approval/signing transaction. A landlord lock keeps
// simultaneous agreements from creating duplicate office follow-ups.
export async function syncLandlordBankApprovalTask(client:PoolClient,landlordId:number){
 await client.query('SELECT id FROM landlords WHERE id=$1 FOR UPDATE',[landlordId]);
 const bank=(await client.query('SELECT b.*,l.name FROM landlord_bank_details b JOIN landlords l ON l.id=b.landlord_id WHERE b.landlord_id=$1',[landlordId])).rows[0];
 if(!bank)return;
 const tasks=(await client.query("SELECT id FROM tasks WHERE entity_type='landlord' AND entity_id=$1 AND task_type='follow_up' AND title=$2 AND status IN ('pending','in_progress') FOR UPDATE",[landlordId,title])).rows;
 if(bank.landlord_approved_at&&!bank.approved_at){
  const description=`Call ${bank.name} using their known contact details to verbally confirm the bank account ending ${String(bank.account_number).slice(-4)}. Record who confirmed the details and the call note under Bank Details → Office Approval on the landlord record. Do not approve solely from the signed agreement.`;
  if(tasks.length)await client.query('UPDATE tasks SET description=$1,updated_at=NOW() WHERE id=ANY($2::int[])',[description,tasks.map(task=>task.id)]);
  else await client.query("INSERT INTO tasks(title,description,status,priority,entity_type,entity_id,due_date,task_type) VALUES($1,$2,'pending','high','landlord',$3,(NOW() AT TIME ZONE 'Europe/London')::date,'follow_up')",[title,description,landlordId]);
 }else if(tasks.length){
  await client.query("UPDATE tasks SET status=$1,completed_at=CASE WHEN $1='completed' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=ANY($2::int[])",[bank.landlord_approved_at&&bank.approved_at?'completed':'archived',tasks.map(task=>task.id)]);
 }
}
