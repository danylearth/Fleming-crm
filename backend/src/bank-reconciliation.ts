import type {Express} from 'express';
import pool from './db-pg';
import {authMiddleware,requireFinance,requirePermission,type AuthRequest} from './auth';

export const pennies=(value:unknown):number=>{
  if(typeof value!=='number'&&typeof value!=='string')throw new Error('Enter a valid amount');
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0||Math.abs(n*100-Math.round(n*100))>0.00001)throw new Error('Amounts must be positive with at most two decimal places');
  return Math.round(n*100);
};

export function registerBankReconciliation(app:Express) {
  app.post('/api/bank-feed/transactions/:id/reconcile',authMiddleware,requireFinance,requirePermission('staff'),async(req:AuthRequest,res)=>{
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const bank=(await client.query('SELECT * FROM bank_feed_transactions WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!bank){await client.query('ROLLBACK');return res.status(404).json({error:'Bank transaction not found'});}
      if(req.body.action==='restore') {
        if(bank.match_status!=='ignored')throw new Error('Only ignored transactions can be restored');
        await client.query("UPDATE bank_feed_transactions SET match_status='unmatched' WHERE id=$1",[bank.id]);
      } else {
        if(bank.match_status!=='unmatched')throw new Error('This transaction has already been reviewed. Refresh the bank feed.');
        if(req.body.action==='ignore')await client.query("UPDATE bank_feed_transactions SET match_status='ignored' WHERE id=$1",[bank.id]);
        else {
          if(req.body.action!=='assign')throw new Error('Choose Assign or Ignore');
          if(bank.currency!=='GBP')throw new Error('Only GBP transactions can be assigned');
          const allocations=req.body.allocations;
          if(!Array.isArray(allocations)||!allocations.length||allocations.length>20)throw new Error('Choose between 1 and 20 allocations');
          const total=allocations.reduce((sum,a)=>sum+pennies(a.amount),0);
          if(total!==pennies(Math.abs(Number(bank.amount))))throw new Error('Allocations must equal the bank transaction amount');
          for(const a of allocations) {
            const amount=pennies(a.amount)/100;
            let propertyId:number;let tenantId:number|null=null;let rentId:number|null=null;let expenseId:number|null=null;
            if(a.kind==='rent') {
              if(Number(bank.amount)<=0)throw new Error('Rent requires an incoming payment');
              const rent=(await client.query('SELECT * FROM rent_payments WHERE id=$1 FOR UPDATE',[a.rent_payment_id])).rows[0];
              if(!rent)throw new Error('Choose an existing rent charge');
              // Bank evidence replaces the office assumption before adding any new payment.
              const assumed=Math.min(Number(rent.opening_balance_amount),amount);
              const paid=Math.round((Number(rent.amount_paid||0)+amount-assumed)*100)/100;
              if(paid>Number(rent.amount_due)+0.001)throw new Error('This allocation exceeds the remaining rent charge');
              await client.query('UPDATE rent_payments SET amount_paid=$1,opening_balance_amount=opening_balance_amount-$2,payment_date=$3,status=$4 WHERE id=$5',[paid,assumed,bank.booked_at,paid>=Number(rent.amount_due)?'paid':'partial',rent.id]);
              propertyId=rent.property_id;tenantId=rent.tenant_id;rentId=rent.id;
            } else if(a.kind==='deposit') {
              if(Number(bank.amount)<=0)throw new Error('A security deposit requires an incoming payment');
              const tenant=(await client.query('SELECT id,property_id FROM tenants WHERE id=$1',[a.tenant_id])).rows[0];
              if(!tenant?.property_id)throw new Error('Choose a tenant with a linked property');
              propertyId=tenant.property_id;tenantId=tenant.id;
              // Receipt does not imply the deposit has been protected with a scheme.
            } else if(a.kind==='expense'||a.kind==='maintenance') {
              if(Number(bank.amount)>=0)throw new Error('Costs require an outgoing transaction');
              const property=(await client.query('SELECT id FROM properties WHERE id=$1',[a.property_id])).rows[0];
              if(!property)throw new Error('Choose a property');
              propertyId=property.id;
              if(a.kind==='maintenance'){
                const job=(await client.query('SELECT id FROM maintenance WHERE id=$1 AND property_id=$2',[a.maintenance_id,propertyId])).rows[0];
                if(!job)throw new Error('Choose a maintenance job at this property');
              }
              const description=String(a.description||bank.description||'Bank payment').trim().slice(0,2000);
              expenseId=(await client.query('INSERT INTO property_expenses(property_id,description,amount,category,expense_date,maintenance_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[propertyId,description,amount,a.kind==='maintenance'?'maintenance':'other',bank.booked_at,a.kind==='maintenance'?a.maintenance_id:null])).rows[0].id;
            } else throw new Error('Choose rent, security deposit, property expense or maintenance');
            await client.query('INSERT INTO bank_feed_allocations(bank_transaction_id,kind,amount,rent_payment_id,tenant_id,property_id,expense_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[bank.id,a.kind,amount,rentId,tenantId,propertyId,expenseId,req.user.id]);
            if(allocations.length===1)await client.query('UPDATE bank_feed_transactions SET property_id=$1,tenant_id=$2,rent_payment_id=$3,expense_id=$4 WHERE id=$5',[propertyId,tenantId,rentId,expenseId,bank.id]);
          }
          const kind=allocations[0].kind;
          await client.query('UPDATE bank_feed_transactions SET match_status=$1 WHERE id=$2',[kind==='rent'?'matched_rent':kind==='deposit'?'matched_deposit':'matched_expense',bank.id]);
        }
      }
      await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'reconcile','bank_feed_transaction',$3,$4)",[req.user.id,req.user.email,bank.id,JSON.stringify(req.body)]);
      await client.query('COMMIT');res.json({success:true});
    } catch(error) {
      await client.query('ROLLBACK');
      res.status(400).json({error:error instanceof Error?error.message:'Could not reconcile transaction'});
    } finally {client.release();}
  });
}
