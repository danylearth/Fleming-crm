import type {PoolClient} from 'pg';

// Office-authorised correction only. Preserve the charge and original invoice
// particulars, without recording a fictional receipt or deleting history.
export async function cancelUnpaidRentCharge(c:PoolClient,id:number,reason:string,user:{id?:number;email:string}){
 if(!reason.trim())throw Error('A reason is required');
 await c.query("SELECT pg_advisory_xact_lock(hashtext('finance-daily'))");
 const before=(await c.query('SELECT * FROM rent_payments WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!before)throw Error('Rent charge not found');
 if(Number(before.amount_due)===0)return;
 if(Number(before.amount_paid)||Number(before.opening_balance_amount)||before.payment_date||before.freeagent_invoice_url||before.freeagent_invoice_reference)throw Error('Reconcile payments or the external invoice before cancelling this charge');
 if((await c.query('SELECT 1 FROM bank_feed_allocations WHERE rent_payment_id=$1 UNION ALL SELECT 1 FROM rent_chaser_deliveries WHERE rent_payment_id=$1',[id])).rowCount)throw Error('Review bank allocations and delivery history before cancelling this charge');
 const documents=(await c.query('SELECT * FROM financial_documents WHERE rent_payment_id=$1 FOR UPDATE',[id])).rows;
 if(documents.some(d=>d.kind!=='rent_invoice'||d.snapshot?.freeagent_invoice_url))throw Error('Review linked financial documents before cancelling this charge');
 const cancelledAt=new Date().toISOString();
 await c.query("UPDATE rent_payments SET amount_due=0,status='pending',notes=concat_ws(E'\\n',notes,$2::text) WHERE id=$1",[id,'Cancelled — '+reason]);
 for(const document of documents)await c.query('UPDATE financial_documents SET snapshot=$2 WHERE id=$1',[document.id,JSON.stringify({...document.snapshot,cancelled_at:cancelledAt,cancellation_reason:reason})]);
 await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'rent_charge_cancelled','rent_payment',$3,$4)",[user.id||null,user.email,id,JSON.stringify({reason,before,original_documents:documents,cancelled_at:cancelledAt})]);
}
