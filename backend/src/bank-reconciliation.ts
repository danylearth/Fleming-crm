import {suggestRentMatches} from './rent-match-suggestions';
import {holdingParticipantGroups,refreshHoldingDeposit} from './holding-deposit-progress';
import {refreshFinalBalance,validateFinalBalance} from './final-balance-progress';
import {finalBalanceMatch} from './final-balance-matches';
import {holdingDepositMatch} from './holding-deposit-matches';
import {resolveDepositParticipants,depositParticipantsSql} from './deposit-participants';
import type {Express,Response} from 'express';
import pool,{query,queryOne,run} from './db-pg';
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
 financial:['Landlord Rent Remittance','Utilities','Accountancy Fees','Administration Expenses','Bank Fees','Commission Payment','Council Tax','Marketing Costs','Stamp Duty','Legal & Professional Fees','Office Costs','Other','Refunds'],
 income:['Commission Payment','Interest Received','Other','Tax Rebate'],
};
async function recalculateRent(client:any,id:number) {
 const rent=(await client.query('SELECT * FROM rent_payments WHERE id=$1 FOR UPDATE',[id])).rows[0];
 const actual=(await client.query(`SELECT COUNT(*)::int n,COALESCE(SUM(a.amount),0) total,MAX(b.booked_at)::date paid_date FROM bank_feed_allocations a JOIN bank_feed_transactions b ON b.id=a.bank_transaction_id WHERE a.rent_payment_id=$1 AND a.reversed_at IS NULL`,[id])).rows[0];
 const paid=actual.n?Number(rent.bank_base_paid||0)-Number(rent.bank_base_opening||0)+Number(actual.total):Number(rent.bank_base_paid||0);
 await client.query('UPDATE rent_payments SET amount_paid=$1,opening_balance_amount=$2,payment_date=$3,status=$4 WHERE id=$5',[paid,actual.n?0:rent.bank_base_opening,actual.n?actual.paid_date:rent.bank_base_date,paid>=Number(rent.amount_due)?'paid':paid>0?'partial':'pending',id]);
}
export function registerBankReconciliation(app:Express) {
 app.get('/api/bank-feed/transactions/:id/rent-suggestions',authMiddleware,requireFinance,requirePermission('staff'),async(req,res)=>{
  const bank=await queryOne('SELECT description,display_name,merchant_name,amount,currency,match_status FROM bank_feed_transactions WHERE id=$1',[req.params.id]);
  if(!bank)return res.status(404).json({error:'Bank transaction not found'});
  if(bank.match_status!=='unmatched'||Number(bank.amount)<=0||bank.currency!=='GBP')return res.json([]);
  const charges=await query(`SELECT r.id,r.tenant_id,r.property_id,r.due_date,r.amount_due,r.amount_paid,t.name AS tenant_name,p.address,l.landlord_type FROM rent_payments r JOIN tenants t ON t.id=r.tenant_id JOIN properties p ON p.id=r.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE COALESCE(r.amount_paid,0)<r.amount_due ORDER BY r.due_date,r.id`);
  const history=await query(`SELECT b.description,b.display_name,b.merchant_name,a.tenant_id,a.property_id,a.created_by FROM bank_feed_allocations a JOIN bank_feed_transactions b ON b.id=a.bank_transaction_id WHERE a.kind='rent' AND a.reversed_at IS NULL AND a.created_by IS NOT NULL AND a.tenant_id=ANY($1::int[]) ORDER BY b.booked_at DESC LIMIT 5000`,[[...new Set(charges.map(r=>r.tenant_id))]]);
  res.json(suggestRentMatches(bank,history,charges));
 });
 const balanceMatches=async(id:number)=>{
  const ids=(await holdingParticipantGroups(pool,[{enquiry_id:id}])).flat();
  const applicants=await query('SELECT first_name_1,last_name_1,first_name_2,last_name_2,balance_due_amount,balance_bank_amount,balance_manual_amount FROM tenant_enquiries WHERE id=ANY($1::int[])',[ids]);
  const payments=await query("SELECT id,booked_at,description,display_name,merchant_name,amount,currency FROM bank_feed_transactions WHERE match_status='unmatched' AND amount>0 AND currency='GBP' ORDER BY booked_at DESC,id DESC");
  return payments.map(payment=>({...payment,match_reason:finalBalanceMatch(payment,applicants)})).filter(payment=>payment.match_reason);
 };
 app.get('/api/tenant-enquiries/:id/balance-matches',authMiddleware,async(req,res)=>res.json(await balanceMatches(Number(req.params.id))));
 // Onboarding exposes only payments matching this enquiry, without granting bank-feed access.
 app.get('/api/tenant-enquiries/:id/holding-deposit-payments',authMiddleware,async(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Choose an enquiry'});
  const ids=(await holdingParticipantGroups(pool,[{enquiry_id:id}])).flat();
  if(!ids.length)return res.status(404).json({error:'Enquiry not found'});
  const applicants=await query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[])',[ids]);
  const available=await query(`SELECT id,booked_at,description,display_name,merchant_name,amount,currency,match_status FROM bank_feed_transactions b
   WHERE match_status='unmatched' AND amount>0 AND currency='GBP'
   AND NOT EXISTS(SELECT 1 FROM bank_feed_allocations a WHERE a.bank_transaction_id=b.id AND a.reversed_at IS NULL)
   ORDER BY booked_at DESC,id DESC`);
  const matches=available.flatMap(row=>{const reason=holdingDepositMatch(row,applicants);return reason?[{id:row.id,booked_at:row.booked_at,description:row.display_name||row.description||row.merchant_name||'Bank payment',amount:Number(row.amount),match_reason:reason}]:[];});
  const linked=await query(`SELECT b.id,b.booked_at,COALESCE(b.display_name,b.description) AS description,SUM(a.amount*SIGN(b.amount)) AS amount
   FROM bank_feed_transactions b JOIN bank_feed_allocations a ON a.bank_transaction_id=b.id
   WHERE a.kind='holding_deposit' AND a.reversed_at IS NULL AND EXISTS(
    SELECT 1 FROM bank_feed_allocation_participants ap LEFT JOIN tenants t ON t.id=ap.tenant_id
    WHERE ap.allocation_id=a.id AND (ap.enquiry_id=ANY($1::int[]) OR t.source_enquiry_id=ANY($1::int[])))
   GROUP BY b.id ORDER BY b.booked_at DESC,b.id DESC`,[ids]);
  res.json({matches,linked});
 });
 app.get('/api/tenant-enquiries/:id/balance-transactions',authMiddleware,async(req,res)=>{
  const ids=(await holdingParticipantGroups(pool,[{enquiry_id:Number(req.params.id)}])).flat();
  const rows=await query(`SELECT b.id,b.booked_at,b.description,b.display_name,b.amount,b.currency,
   SUM(a.amount) AS allocated_amount FROM bank_feed_transactions b JOIN bank_feed_allocations a ON a.bank_transaction_id=b.id
   WHERE a.kind='final_balance' AND a.reversed_at IS NULL AND EXISTS(SELECT 1 FROM bank_feed_allocation_participants ap WHERE ap.allocation_id=a.id AND ap.enquiry_id=ANY($1::int[])) GROUP BY b.id ORDER BY b.booked_at DESC,b.id DESC`,[ids]);
  res.json(rows);
 });
 app.get('/api/rent-payments/:id/bank-transactions',authMiddleware,requireFinance,async(req,res)=>{
  const rows=await query(`SELECT b.id,b.booked_at,b.description,b.display_name,b.merchant_name,b.amount,b.currency,b.match_status,
    (SELECT json_agg(json_build_object('id',a.id,'kind',a.kind,'amount',a.amount,'rent_payment_id',a.rent_payment_id,'category',a.category,'notes',a.notes,'tenant_name',(SELECT name FROM tenants WHERE id=a.tenant_id),'property_address',(SELECT address FROM properties WHERE id=a.property_id)) ORDER BY a.id) FROM bank_feed_allocations a WHERE a.bank_transaction_id=b.id AND a.reversed_at IS NULL) AS allocations
    FROM bank_feed_transactions b WHERE EXISTS(SELECT 1 FROM bank_feed_allocations a WHERE a.bank_transaction_id=b.id AND a.rent_payment_id=$1 AND a.reversed_at IS NULL) ORDER BY b.booked_at DESC,b.id DESC`,[req.params.id]);
  res.json(rows);
 });
 app.get('/api/bank-feed/deposit-balances',authMiddleware,requireFinance,async(_req,res)=>{
  const rows=await query(`SELECT b.id,b.booked_at,b.description,b.display_name,b.amount,b.currency,b.match_status,t.name AS tenant_name,p.address AS property_address,
   (SELECT json_agg(json_build_object('kind',a.kind,'amount',a.amount,'tenant_id',a.tenant_id,'property_id',a.property_id,'category',a.category,'notes',a.notes,'participants',${depositParticipantsSql},'tenant_name',(SELECT name FROM tenants WHERE id=a.tenant_id),'property_address',(SELECT address FROM properties WHERE id=a.property_id))) FROM bank_feed_allocations a WHERE a.bank_transaction_id=b.id AND a.reversed_at IS NULL) AS allocations
   FROM bank_feed_transactions b LEFT JOIN tenants t ON t.id=b.tenant_id LEFT JOIN properties p ON p.id=b.property_id
   WHERE EXISTS(SELECT 1 FROM bank_feed_allocations a WHERE a.bank_transaction_id=b.id AND a.reversed_at IS NULL AND (a.kind IN ('deposit','holding_deposit') OR a.category IN ('Security Deposit Payments In','Security Deposit Payments Out')))
   ORDER BY b.booked_at DESC,b.id DESC`);
  let security=0,holding=0;for(const row of rows)for(const a of row.allocations){const signed=Math.sign(Number(row.amount))*Math.round(Number(a.amount)*100);if(a.kind==='holding_deposit')holding+=signed;else if(a.kind==='deposit'||['Security Deposit Payments In','Security Deposit Payments Out'].includes(a.category))security+=signed;}
  res.json({security:security/100,holding:holding/100,transactions:rows});
 });

 app.patch('/api/bank-feed/transactions/:id/name',authMiddleware,requireFinance,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const name=String(req.body.display_name||'').trim();if(!name||name.length>300)return res.status(400).json({error:'Enter a transaction name up to 300 characters'});
  const row=await queryOne('UPDATE bank_feed_transactions SET display_name=$1 WHERE id=$2 RETURNING id,description,display_name',[name,req.params.id]);if(!row)return res.sendStatus(404);
  await run("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'rename','bank_feed_transaction',$3,$4)",[req.user.id,req.user.email,row.id,JSON.stringify({display_name:name,original_import_name:row.description})]);res.json(row);
 });

 const reconcileTransaction=async(req:AuthRequest,res:Response,holdingEnquiryId?:number)=>{
  const client=await pool.connect();
  try {
   await client.query('BEGIN');
   const bank=(await client.query('SELECT * FROM bank_feed_transactions WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!bank){await client.query('ROLLBACK');return res.status(404).json({error:'Bank transaction not found'});}
   if(holdingEnquiryId!==undefined){
    const ids=(await holdingParticipantGroups(client,[{enquiry_id:holdingEnquiryId}])).flat();
    const applicants=(await client.query('SELECT * FROM tenant_enquiries WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[ids])).rows;
    const allocated=(await client.query('SELECT id FROM bank_feed_allocations WHERE bank_transaction_id=$1 AND reversed_at IS NULL',[bank.id])).rows;
    if(allocated.length||!holdingDepositMatch(bank,applicants))throw Error('This payment is no longer available or does not match this holding deposit');
    // Revalidate under the transaction lock; never accept an arbitrary allocation from this endpoint.
    req.body={action:'assign',allocations:[{kind:'holding_deposit',amount:Number(bank.amount),participants:ids.map(enquiry_id=>({enquiry_id}))}]};
   }
   const action=req.body.action;
   const holdingGroups=new Map<number,number[]>();
   const balanceGroups=new Map<number,number[]>();
   if(action==='unassign') {
    const old=(await client.query('SELECT * FROM bank_feed_allocations WHERE bank_transaction_id=$1 AND reversed_at IS NULL ORDER BY rent_payment_id NULLS LAST FOR UPDATE',[bank.id])).rows;
    if(!old.length)throw new Error('This transaction has no allocation to remove');
    const oldParticipants=(await client.query("SELECT ap.tenant_id,ap.enquiry_id FROM bank_feed_allocation_participants ap JOIN bank_feed_allocations a ON a.id=ap.allocation_id WHERE a.bank_transaction_id=$1 AND a.kind='holding_deposit' AND a.reversed_at IS NULL",[bank.id])).rows;
    for(const ids of await holdingParticipantGroups(client,oldParticipants))holdingGroups.set(ids[0],ids);
    const balanceParticipants=(await client.query("SELECT ap.enquiry_id FROM bank_feed_allocation_participants ap JOIN bank_feed_allocations a ON a.id=ap.allocation_id WHERE a.bank_transaction_id=$1 AND a.kind='final_balance' AND a.reversed_at IS NULL",[bank.id])).rows;
    for(const ids of await holdingParticipantGroups(client,balanceParticipants))balanceGroups.set(ids[0],ids);
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
     if(allocations.some(a=>a.kind==='rent')&&req.body.confirm_rent_assignment!==true)throw new Error('Confirm the rent allocation before saving');
     if(allocations.reduce((sum,a)=>sum+pennies(a.amount),0)!==pennies(Math.abs(Number(bank.amount))))throw new Error('Allocations must equal the bank transaction amount');
     const rentIds=[...new Set(allocations.filter(a=>a.kind==='rent').map(a=>Number(a.rent_payment_id)))].sort((a,b)=>a-b);
     for(const id of rentIds){if(!Number.isInteger(Number(id))||Number(id)<=0)throw new Error('Choose a rent charge');await client.query('SELECT id FROM rent_payments WHERE id=$1 FOR UPDATE',[id]);}
     for(const a of allocations) {
      const amount=pennies(a.amount)/100,incoming=Number(bank.amount)>0;
      let participants:{tenant_id?:number;enquiry_id?:number}[]=[];
      let propertyId:number|null=null,tenantId:number|null=null,rentId:number|null=null,expenseId:number|null=null;
      const category=String(a.category||''),notes=String(a.notes||'').trim().slice(0,4000);
      if(a.kind==='rent') {
       if(!Number.isInteger(Number(a.rent_payment_id))||Number(a.rent_payment_id)<=0)throw new Error('Choose a rent charge');
       if(!incoming)throw new Error('Rent requires an incoming payment');
       const rent=(await client.query('SELECT * FROM rent_payments WHERE id=$1 FOR UPDATE',[a.rent_payment_id])).rows[0];
       if(!rent)throw new Error('Choose an existing rent charge');
       if(rent.bank_base_paid===null)await client.query('UPDATE rent_payments SET bank_base_paid=COALESCE(amount_paid,0),bank_base_opening=opening_balance_amount,bank_base_date=payment_date WHERE id=$1',[rent.id]);
       propertyId=rent.property_id;tenantId=rent.tenant_id;rentId=rent.id;
      } else if(a.kind==='deposit'||a.kind==='holding_deposit'||a.kind==='final_balance') {
       const resolved=await resolveDepositParticipants(client,a);propertyId=resolved.propertyId;tenantId=resolved.tenantId;participants=resolved.participants;
       if(a.kind==='final_balance'){
        if(!incoming||participants.some(p=>!p.enquiry_id))throw Error('Final balance requires an incoming payment linked to a tenant enquiry');
        const groups=await holdingParticipantGroups(client,participants);
        if(groups.length!==1)throw Error('Allocate each unrelated final balance separately');
        await validateFinalBalance(client,groups[0]);balanceGroups.set(groups[0][0],groups[0]);
       }
       if(a.kind==='holding_deposit'){const groups=await holdingParticipantGroups(client,participants);if(groups.length>1)throw new Error('Allocate each unrelated enquiry separately, even at the same property');for(const ids of groups)holdingGroups.set(ids[0],ids);}
      } else if(['holding_deposit','expense','maintenance','financial','income'].includes(a.kind)) {
       if(category==='Landlord Rent Remittance'&&(a.kind!=='financial'||incoming||!a.property_id))throw new Error('Landlord remittances require an outgoing payment and a linked property');
       if(a.kind==='income'&&!incoming)throw new Error('This payment type requires money in');
       if(['expense','maintenance'].includes(a.kind)&&incoming)throw new Error('Costs require an outgoing transaction');
       if(a.kind!=='holding_deposit'&&!allocationCategories[a.kind].includes(category))throw new Error('Choose a payment category');
       if(category==='Security Deposit Payments In'&&!incoming||category==='Security Deposit Payments Out'&&incoming)throw new Error('Choose the correct deposit direction');
       if(a.property_id){if(!Number.isInteger(Number(a.property_id))||Number(a.property_id)<=0)throw new Error('Choose a property');const property=(await client.query('SELECT id FROM properties WHERE id=$1',[a.property_id])).rows[0];if(!property)throw new Error('Choose an existing property');propertyId=property.id;}
       if(category==='Landlord Rent Remittance'&&propertyId){const owner=(await client.query('SELECT l.landlord_type FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE p.id=$1',[propertyId])).rows[0];if(owner?.landlord_type!=='external')throw new Error('Choose an external landlord property for a remittance');}
       if(['holding_deposit','expense','maintenance'].includes(a.kind)&&!propertyId)throw new Error('Choose a property');
       if(a.kind==='maintenance'&&a.maintenance_id) {
        if(!Number.isInteger(Number(a.maintenance_id))||Number(a.maintenance_id)<=0)throw new Error('Choose a maintenance task');
        const job=(await client.query('SELECT id FROM maintenance WHERE id=$1 AND property_id=$2',[a.maintenance_id,propertyId])).rows[0];
        if(!job)throw new Error('Choose a maintenance job at this property');
       }
       if(!incoming&&propertyId&&a.kind!=='holding_deposit'&&category!=='Landlord Rent Remittance'&&!category.startsWith('Security Deposit Payments'))expenseId=(await client.query('INSERT INTO property_expenses(property_id,description,amount,category,expense_date,maintenance_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[propertyId,[bank.display_name||bank.description,notes].filter(Boolean).join(' — ').slice(0,4000),amount,category,bank.booked_at,a.kind==='maintenance'&&a.maintenance_id?a.maintenance_id:null])).rows[0].id;
      } else throw new Error('Choose a payment type');
      const inserted=(await client.query('INSERT INTO bank_feed_allocations(bank_transaction_id,kind,amount,rent_payment_id,tenant_id,property_id,expense_id,created_by,category,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[bank.id,a.kind,amount,rentId,tenantId,propertyId,expenseId,req.user.id,category||null,notes||null])).rows[0];
      for(const p of participants)await client.query('INSERT INTO bank_feed_allocation_participants(allocation_id,tenant_id,enquiry_id) VALUES($1,$2,$3)',[inserted.id,p.tenant_id||null,p.enquiry_id||null]);
      if(allocations.length===1)await client.query('UPDATE bank_feed_transactions SET property_id=$1,tenant_id=$2,rent_payment_id=$3,expense_id=$4 WHERE id=$5',[propertyId,tenantId,rentId,expenseId,bank.id]);
     }
     for(const id of rentIds)await recalculateRent(client,id);
     const kind=allocations[0].kind;
     await client.query('UPDATE bank_feed_transactions SET match_status=$1 WHERE id=$2',[['rent','final_balance'].includes(kind)?'matched_rent':['deposit','holding_deposit'].includes(kind)?'matched_deposit':'matched_expense',bank.id]);
    }
   }
   for(const ids of [...holdingGroups.values()].sort((a,b)=>a[0]-b[0]))await refreshHoldingDeposit(client,ids);
   for(const ids of [...balanceGroups.values()].sort((a,b)=>a[0]-b[0]))await refreshFinalBalance(client,ids);
   await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'reconcile','bank_feed_transaction',$3,$4)",[req.user.id,req.user.email,bank.id,JSON.stringify(req.body)]);
   await client.query('COMMIT');res.json({success:true});
  } catch(error) {await client.query('ROLLBACK');res.status(400).json({error:error instanceof Error?error.message:'Could not reconcile transaction'});}
  finally {client.release();}
 };
 app.post('/api/bank-feed/transactions/:id/reconcile',authMiddleware,requireFinance,requirePermission('staff'),(req:AuthRequest,res)=>reconcileTransaction(req,res));
 app.post('/api/tenant-enquiries/:id/allocate-holding-deposit',authMiddleware,async(req:AuthRequest,res)=>{
  const enquiryId=Number(req.params.id),transactionId=Number(req.body.transaction_id);
  if(!Number.isSafeInteger(enquiryId)||enquiryId<=0||!Number.isSafeInteger(transactionId)||transactionId<=0)return res.status(400).json({error:'Choose an enquiry and matching bank transaction'});
  req.params.id=String(transactionId);
  return reconcileTransaction(req,res,enquiryId);
 });
 app.post('/api/tenant-enquiries/:id/allocate-balance',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const enquiryId=Number(req.params.id),transactionId=Number(req.body.transaction_id);
  const match=(await balanceMatches(enquiryId)).find(row=>row.id===transactionId);
  if(!match)return res.status(409).json({error:'Choose an available payment matching this balance or an applicant name'});
  // This route grants access only to a matching payment and a fixed allocation purpose.
  req.params.id=String(transactionId);
  req.body={action:'assign',allocations:[{kind:'final_balance',amount:Number(match.amount),participants:[{enquiry_id:enquiryId}]}]};
  return reconcileTransaction(req,res);
 });
}
