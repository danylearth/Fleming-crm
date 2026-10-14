import type {PoolClient} from 'pg';

// Remove an unused rent charge and its local invoice together. Financial
// evidence is never cascaded away; the office must reconcile it explicitly.
export async function removeUnpaidRentCharge(c:PoolClient,id:number,reason:string,user:{id?:number;email:string}){
 if(!reason.trim())throw Error('A reason is required');
 await c.query("SELECT pg_advisory_xact_lock(hashtext('finance-daily'))");
 const before=(await c.query('SELECT * FROM rent_payments WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!before)return {removed:false,reason:null};
 const documents=(await c.query('SELECT * FROM financial_documents WHERE rent_payment_id=$1 FOR UPDATE',[id])).rows;
 let blocked:string|null=null;
 if(Number(before.amount_paid)||Number(before.opening_balance_amount)||before.payment_date)blocked='has recorded payments';
 else if(before.freeagent_invoice_url||before.freeagent_invoice_reference||documents.some(d=>d.snapshot?.freeagent_invoice_url||d.snapshot?.invoice_reference))blocked='has an external invoice';
 else if(documents.some(d=>d.kind!=='rent_invoice'||d.allocation_id))blocked='has linked financial documents';
 else if((await c.query('SELECT 1 FROM bank_feed_allocations WHERE rent_payment_id=$1 UNION ALL SELECT 1 FROM rent_chaser_deliveries WHERE rent_payment_id=$1',[id])).rowCount)blocked='has bank allocations or delivery history';
 if(blocked)return {removed:false,reason:`Rent charge ${id} (${String(before.due_date).slice(0,10)}) ${blocked}; review its final balance.`};
 await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'rent_charge_removed_not_due','rent_payment',$3,$4)",[user.id||null,user.email,id,JSON.stringify({reason,before,removed_invoices:documents})]);
 await c.query('DELETE FROM financial_documents WHERE rent_payment_id=$1',[id]);
 await c.query('DELETE FROM rent_payments WHERE id=$1',[id]);
 return {removed:true,reason:null};
}

export async function removeRentChargesAtTenancyEnd(c:PoolClient,tenantIds:number[],propertyId:number,endDate:string,user:{id?:number;email:string}){
 const rows=(await c.query(`SELECT r.id FROM rent_payments r JOIN tenants t ON t.id=r.tenant_id
  LEFT JOIN tenancy_billing_profiles profile ON profile.id=r.tenancy_profile_id
  WHERE r.tenant_id=ANY($1::int[]) AND r.property_id=$2 AND r.due_date >= $3 AND r.due_date >= t.tenancy_start_date
    AND (profile.start_date=t.tenancy_start_date OR (r.tenancy_profile_id IS NULL AND NOT EXISTS(
      SELECT 1 FROM tenancy_billing_profiles next WHERE next.property_id=r.property_id AND r.tenant_id=ANY(next.tenant_ids)
      AND next.start_date>t.tenancy_start_date AND next.start_date<=r.due_date)))
  ORDER BY r.id FOR UPDATE OF r`,[tenantIds,propertyId,endDate])).rows;
 const removed:number[]=[],review:string[]=[];
 for(const row of rows){const result=await removeUnpaidRentCharge(c,row.id,'Tenancy ends '+endDate+'; no new rent is due on or after the end date.',user);if(result.removed)removed.push(row.id);else if(result.reason)review.push(result.reason);}
 return {removed,review};
}

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
