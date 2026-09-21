import type {Express} from 'express';
import pool,{queryOne,run} from './db-pg';
import {authMiddleware,requireFinance,requirePermission,type AuthRequest} from './auth';

export const pennies=(value:unknown):number=>{
  if(typeof value!=='number'&&typeof value!=='string')throw new Error('Enter a valid amount');
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0||Math.abs(n*100-Math.round(n*100))>0.00001)throw new Error('Amounts must be positive with at most two decimal places');
  return Math.round(n*100);
};

export const allocationCategories:Record<string,string[]>={
 expense:['Ground Rent','Insurance','Lease Renewal','Management Fee','Other','Service Charge'],
 maintenance:["Contractors Invoice",'Labour','Materials','Other','Refurbishment','Servicing'],
 financial:['Accountancy Fees','Administration Expenses','Bank Fees','Commission Payment','Legal & Professional Fees','Office Costs','Other','Refunds','Security Deposit Payments In','Security Deposit Payments Out'],
 income:['Commission Payment','Interest Received','Other','Tax Rebate'],
};
async function recalculateRent(client:any,id:number) {
 const rent=(await client.query('SELECT * FROM rent_payments WHERE id=$1 FOR UPDATE',[id])).rows[0];
 const actual=(await client.query(`SELECT COUNT(*)::int n,COALESCE(SUM(a.amount),0) total,MAX(b.booked_at)::date paid_date FROM bank_feed_allocations a JOIN bank_feed_transactions b ON b.id=a.bank_transaction_id WHERE a.rent_payment_id=$1 AND a.reversed_at IS NULL`,[id])).rows[0];
 const paid=actual.n?Number(rent.bank_base_paid||0)-Number(rent.bank_base_opening||0)+Number(actual.total):Number(rent.bank_base_paid||0);
 await client.query('UPDATE rent_payments SET amount_paid=$1,opening_balance_amount=$2,payment_date=$3,status=$4 WHERE id=$5',[paid,actual.n?0:rent.bank_base_opening,actual.n?actual.paid_date:rent.bank_base_date,paid>=Number(rent.amount_due)?'paid':paid>0?'partial':'pending',id]);
}
export function registerBankReconciliation(app:Express) {
 app.patch('/api/bank-feed/transactions/:id/name',authMiddleware,requireFinance,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const name=String(req.body.display_name||'').trim();if(!name||name.length>300)return res.status(400).json({error:'Enter a transaction name up to 300 characters'});
  const row=await queryOne('UPDATE bank_feed_transactions SET display_name=$1 WHERE id=$2 RETURNING id,description,display_name',[name,req.params.id]);if(!row)return res.sendStatus(404);
  await run("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'rename','bank_feed_transaction',$3,$4)",[req.user.id,req.user.email,row.id,JSON.stringify({display_name:name,original_import_name:row.description})]);res.json(row);
 });

 app.post('/api/bank-feed/transactions/:id/reconcile',authMiddleware,requireFinance,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const client=await pool.connect();
  try {
   await client.query('BEGIN');
   const bank=(await client.query('SELECT * FROM bank_feed_transactions WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!bank){await client.query('ROLLBACK');return res.status(404).json({error:'Bank transaction not found'});}
   const action=req.body.action;
   if(action==='unassign') {
    const old=(await client.query('SELECT * FROM bank_feed_allocations WHERE bank_transaction_id=$1 AND reversed_at IS NULL ORDER BY rent_payment_id NULLS LAST FOR UPDATE',[bank.id])).rows;
    if(!old.length)throw new Error('This transaction has no allocation to remove');
    const rentIds=[...new Set(old.map((a:any)=>a.rent_payment_id).filter(Boolean))].sort((a:any,b:any)=>a-b);
    for(const id of rentIds){if(!Number.isInteger(Number(id))||Number(id)<=0)throw new Error('Choose a rent charge');await client.query('SELECT id FROM rent_payments WHERE id=$1 FOR UPDATE',[id]);}
    await client.query('UPDATE bank_feed_allocations SET reversed_at=NOW() WHERE bank_transaction_id=$1 AND reversed_at IS NULL',[bank.id]);
    // Keep the original expense and its evidence, but exclude it from actual costs.
    for(const a of old)if(a.expense_id)await client.query("UPDATE property_expenses SET is_estimate=TRUE,description=description || ' [Allocation reversed]' WHERE id=$1",[a.expense_id]);
    for(const id of rentIds)await recalculateRent(client,id as number);
    await client.query("UPDATE bank_feed_transactions SET match_status='unmatched',property_id=NULL,tenant_id=NULL,rent_payment_id=NULL,expense_id=NULL WHERE id=$1",[bank.id]);
   } else if(action==='restore') {
    if(bank.match_status!=='ignored')throw new Error('Only ignored transactions can be restored');
    await client.query("UPDATE bank_feed_transactions SET match_status='unmatched' WHERE id=$1",[bank.id]);
   } else {
    if(bank.match_status!=='unmatched')throw new Error('Unallocate this transaction before changing its assignment');
    if(action==='ignore')await client.query("UPDATE bank_feed_transactions SET match_status='ignored' WHERE id=$1",[bank.id]);
    else {
     if(action!=='assign')throw new Error('Choose Assign or Ignore');
     if(bank.currency!=='GBP')throw new Error('Only GBP transactions can be assigned');
     const allocations=req.body.allocations;
     if(!Array.isArray(allocations)||!allocations.length||allocations.length>20)throw new Error('Choose between 1 and 20 allocations');
     if(allocations.reduce((sum,a)=>sum+pennies(a.amount),0)!==pennies(Math.abs(Number(bank.amount))))throw new Error('Allocations must equal the bank transaction amount');
     const rentIds=[...new Set(allocations.filter(a=>a.kind==='rent').map(a=>Number(a.rent_payment_id)))].sort((a,b)=>a-b);
     for(const id of rentIds){if(!Number.isInteger(Number(id))||Number(id)<=0)throw new Error('Choose a rent charge');await client.query('SELECT id FROM rent_payments WHERE id=$1 FOR UPDATE',[id]);}
     for(const a of allocations) {
      const amount=pennies(a.amount)/100,incoming=Number(bank.amount)>0;
      let propertyId:number|null=null,tenantId:number|null=null,rentId:number|null=null,expenseId:number|null=null;
      const category=String(a.category||''),notes=String(a.notes||'').trim().slice(0,4000);
      if(a.kind==='rent') {
       if(!Number.isInteger(Number(a.rent_payment_id))||Number(a.rent_payment_id)<=0)throw new Error('Choose a rent charge');
       if(!incoming)throw new Error('Rent requires an incoming payment');
       const rent=(await client.query('SELECT * FROM rent_payments WHERE id=$1 FOR UPDATE',[a.rent_payment_id])).rows[0];
       if(!rent)throw new Error('Choose an existing rent charge');
       if(rent.bank_base_paid===null)await client.query('UPDATE rent_payments SET bank_base_paid=COALESCE(amount_paid,0),bank_base_opening=opening_balance_amount,bank_base_date=payment_date WHERE id=$1',[rent.id]);
       propertyId=rent.property_id;tenantId=rent.tenant_id;rentId=rent.id;
      } else if(a.kind==='deposit') {
       if(!Number.isInteger(Number(a.tenant_id))||Number(a.tenant_id)<=0)throw new Error('Choose a tenant');
       if(!incoming)throw new Error('A security deposit requires an incoming payment');
       const tenant=(await client.query('SELECT id,property_id FROM tenants WHERE id=$1',[a.tenant_id])).rows[0];
       if(!tenant?.property_id)throw new Error('Choose a tenant with a linked property');
       propertyId=tenant.property_id;tenantId=tenant.id;
      } else if(['holding_deposit','expense','maintenance','financial','income'].includes(a.kind)) {
       if(['holding_deposit','income'].includes(a.kind)&&!incoming)throw new Error('This payment type requires money in');
       if(['expense','maintenance'].includes(a.kind)&&incoming)throw new Error('Costs require an outgoing transaction');
       if(a.kind!=='holding_deposit'&&!allocationCategories[a.kind].includes(category))throw new Error('Choose a payment category');
       if(category==='Security Deposit Payments In'&&!incoming||category==='Security Deposit Payments Out'&&incoming)throw new Error('Choose the correct deposit direction');
       if(a.property_id){if(!Number.isInteger(Number(a.property_id))||Number(a.property_id)<=0)throw new Error('Choose a property');const property=(await client.query('SELECT id FROM properties WHERE id=$1',[a.property_id])).rows[0];if(!property)throw new Error('Choose an existing property');propertyId=property.id;}
       if(['holding_deposit','expense','maintenance'].includes(a.kind)&&!propertyId)throw new Error('Choose a property');
       if(a.kind==='maintenance'&&a.maintenance_id) {
        if(!Number.isInteger(Number(a.maintenance_id))||Number(a.maintenance_id)<=0)throw new Error('Choose a maintenance task');
        const job=(await client.query('SELECT id FROM maintenance WHERE id=$1 AND property_id=$2',[a.maintenance_id,propertyId])).rows[0];
        if(!job)throw new Error('Choose a maintenance job at this property');
       }
       if(!incoming&&propertyId)expenseId=(await client.query('INSERT INTO property_expenses(property_id,description,amount,category,expense_date,maintenance_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[propertyId,[bank.display_name||bank.description,notes].filter(Boolean).join(' — ').slice(0,4000),amount,category,bank.booked_at,a.kind==='maintenance'&&a.maintenance_id?a.maintenance_id:null])).rows[0].id;
      } else throw new Error('Choose a payment type');
      await client.query('INSERT INTO bank_feed_allocations(bank_transaction_id,kind,amount,rent_payment_id,tenant_id,property_id,expense_id,created_by,category,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[bank.id,a.kind,amount,rentId,tenantId,propertyId,expenseId,req.user.id,category||null,notes||null]);
      if(allocations.length===1)await client.query('UPDATE bank_feed_transactions SET property_id=$1,tenant_id=$2,rent_payment_id=$3,expense_id=$4 WHERE id=$5',[propertyId,tenantId,rentId,expenseId,bank.id]);
     }
     for(const id of rentIds)await recalculateRent(client,id);
     const kind=allocations[0].kind;
     await client.query('UPDATE bank_feed_transactions SET match_status=$1 WHERE id=$2',[kind==='rent'?'matched_rent':['deposit','holding_deposit'].includes(kind)?'matched_deposit':'matched_expense',bank.id]);
    }
   }
   await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'reconcile','bank_feed_transaction',$3,$4)",[req.user.id,req.user.email,bank.id,JSON.stringify(req.body)]);
   await client.query('COMMIT');res.json({success:true});
  } catch(error) {await client.query('ROLLBACK');res.status(400).json({error:error instanceof Error?error.message:'Could not reconcile transaction'});}
  finally {client.release();}
 });
}
