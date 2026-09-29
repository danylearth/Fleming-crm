type Client={query:(sql:string,values?:any[])=>Promise<{rows:any[]}>};

export function finalBalanceProgress(due:unknown,manual:unknown,bank:unknown) {
 const expected=Math.max(0,Math.round(Number(due||0)*100));
 // Manual confirmation describes the total received, never an extra payment.
 const received=Math.max(0,Math.round(Number(manual||0)*100),Math.round(Number(bank||0)*100));
 return {received:received/100,remaining:Math.max(0,expected-received)/100,complete:expected>0&&received>=expected};
}

export async function validateFinalBalance(client:Client,ids:number[]) {
 const records=(await client.query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
 if(!records.length||records.some(r=>!r.balance_payment_requested||Number(r.balance_due_amount)<=0||['converted','rejected','closed','archived','not_interested'].includes(r.status)))throw Error('Choose an active enquiry with a requested final balance');
 const agreement=(await client.query("SELECT status FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void' ORDER BY id DESC LIMIT 1",[ids])).rows[0];
 if(agreement?.status!=='completed')throw Error('All parties must sign the current agreement before allocating the final balance');
}

export async function refreshFinalBalance(client:Client,ids:number[]) {
 const records=(await client.query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
 const bank=(await client.query(`SELECT COALESCE(SUM(a.amount),0) amount,MAX(b.booked_at)::date::text received_date
 FROM bank_feed_allocations a JOIN bank_feed_transactions b ON b.id=a.bank_transaction_id
 WHERE a.kind='final_balance' AND a.reversed_at IS NULL AND EXISTS(
 SELECT 1 FROM bank_feed_allocation_participants ap WHERE ap.allocation_id=a.id AND ap.enquiry_id=ANY($1::int[]))`,[ids])).rows[0];
 for(const record of records){
  const progress=finalBalanceProgress(record.balance_due_amount,record.balance_manual_amount,bank.amount);
  const date=Number(bank.amount)>=Number(record.balance_manual_amount||0)?bank.received_date:record.balance_manual_date;
  await client.query(`UPDATE tenant_enquiries SET balance_bank_amount=$1,balance_bank_date=$2,balance_payment_received=$3,balance_payment_received_at=$4,updated_at=NOW() WHERE id=$5`,[bank.amount,bank.received_date||null,progress.complete?1:0,progress.complete?date:null,record.id]);
  await client.query(`UPDATE tasks SET status=$1,updated_at=NOW() WHERE entity_type='tenant_enquiry' AND entity_id=$2 AND task_type='follow_up' AND title LIKE 'Chase final tenancy balance%' AND status IN ('pending','in_progress','completed')`,[progress.complete?'completed':'pending',record.id]);
 }
}
