type Client={query:(sql:string,values?:any[])=>Promise<{rows:any[]}>};
export function holdingDepositTotal(expected:unknown,manual:unknown,bank:unknown) {
  // Manual confirmation describes the total received, not an additional bank payment.
  const amount=Math.max(0,Math.round(Number(manual||0)*100),Math.round(Number(bank||0)*100));
  const due=Math.round(Number(expected||0)*100);
  return {amount:amount/100,received:due>0&&amount>=due};
}
export async function enquiryGroup(client:Client,id:number) {
 const row=(await client.query('SELECT id,joint_partner_id FROM tenant_enquiries WHERE id=$1',[id])).rows[0];
 if(!row)return [];
 return [...new Set([Number(row.id),Number(row.joint_partner_id)].filter(Boolean))].sort((a,b)=>a-b);
}
export async function refreshDepositApplicationReady(client:Client,ids:number[]) {
 if(!ids.length)return;
 const records=(await client.query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
 const active=records.length===ids.length&&records.every(r=>!['converted','rejected','closed','archived','not_interested'].includes(r.status));
 const ready=active&&records.every(r=>r.holding_deposit_received&&r.application_form_completed);
 const root=ids[0];
 if(!ready){
  await client.query('UPDATE tenant_enquiries SET deposit_application_ready_at=NULL WHERE id=ANY($1::int[])',[ids]);
  await client.query("UPDATE tasks SET status='archived',updated_at=NOW() WHERE entity_type='tenant_enquiry' AND entity_id=$1 AND title LIKE 'Deposit & application ready:%' AND status IN ('pending','in_progress')",[root]);
  return;
 }
 if(records.every(r=>r.deposit_application_ready_at)||!records.some(r=>r.application_review_status==='pending'))return;
 await client.query("UPDATE tenant_enquiries SET deposit_application_ready_at=NOW(),status='onboarding',onboarding_step=GREATEST(COALESCE(onboarding_step,0),3),updated_at=NOW() WHERE id=ANY($1::int[])",[ids]);
 await client.query(`INSERT INTO tasks(title,description,status,priority,entity_type,entity_id,task_type,due_date)
  SELECT $1,$2,'pending','high','tenant_enquiry',$3,'manual',CURRENT_DATE
  WHERE NOT EXISTS(SELECT 1 FROM tasks WHERE entity_type='tenant_enquiry' AND entity_id=$3 AND title LIKE 'Deposit & application ready:%' AND status IN ('pending','in_progress'))`,[
  'Deposit & application ready: '+records.map(r=>[r.first_name_1,r.last_name_1].filter(Boolean).join(' ')).join(' & '),
  'The full holding deposit has been received and all applicants have submitted their application. Review the application in tenant onboarding.',root]);
 await client.query("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES('System','deposit_application_ready','tenant_enquiry',$1,$2)",[root,JSON.stringify({applicant_ids:ids})]);
}
export async function refreshHoldingDeposit(client:Client,ids:number[]) {
 if(!ids.length)return;
 const records=(await client.query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
 const bank=(await client.query(`SELECT COALESCE(SUM(a.amount*SIGN(b.amount)),0) AS amount,MAX(b.booked_at)::date::text AS received_date
 FROM bank_feed_allocations a JOIN bank_feed_transactions b ON b.id=a.bank_transaction_id
 WHERE a.kind='holding_deposit' AND a.reversed_at IS NULL AND EXISTS(
  SELECT 1 FROM bank_feed_allocation_participants ap LEFT JOIN tenants t ON t.id=ap.tenant_id
  WHERE ap.allocation_id=a.id AND (ap.enquiry_id=ANY($1::int[]) OR t.source_enquiry_id=ANY($1::int[])))`,[ids])).rows[0];
 for(const record of records){
  const manual=record.holding_deposit_manual_amount;
  const total=holdingDepositTotal(record.holding_deposit_amount,manual,bank?.amount);
  const date=Number(bank?.amount||0)>=Number(manual||0)?bank?.received_date:record.holding_deposit_manual_date;
  await client.query(`UPDATE tenant_enquiries SET holding_deposit_bank_amount=$1,holding_deposit_bank_date=$2,holding_deposit_received=$3,holding_deposit_received_amount=$4,holding_deposit_received_date=$5,updated_at=NOW() WHERE id=$6`,[Number(bank?.amount||0),bank?.received_date||null,total.received?1:0,total.amount,date||null,record.id]);
 }
 await refreshDepositApplicationReady(client,ids);
}
export async function holdingParticipantGroups(client:Client,participants:{tenant_id?:number;enquiry_id?:number}[]) {
 const groups=new Map<number,number[]>();
 for(const p of participants){
  const id=p.enquiry_id||(p.tenant_id?(await client.query('SELECT source_enquiry_id FROM tenants WHERE id=$1',[p.tenant_id])).rows[0]?.source_enquiry_id:null);
  if(id){const ids=await enquiryGroup(client,Number(id));if(ids.length)groups.set(ids[0],ids);}
 }
 return [...groups.values()].sort((a,b)=>a[0]-b[0]);
}
