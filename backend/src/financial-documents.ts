import {rentInvoiceDates,rentPaymentReference,rentPropertyAddress} from './rent-invoice-details';
import {bankDetailsForRoute,resolvePaymentRoute,resolveAgreementType} from './tenancy-agreement-pdf';
import type {Express} from 'express';
import {authMiddleware,requireFinance,requirePermission,type AuthRequest} from './auth';
import pool,{query,queryOne} from './db-pg';
import {financialDocumentPdf,financialNumber,type FinancialSnapshot} from './financial-document-pdf';
export function validInvoiceAmount(value:unknown){const n=Number(value);if(!Number.isFinite(n)||n<=0||n>10000000||Math.abs(n*100-Math.round(n*100))>0.00001)throw Error('Enter a positive amount with no more than two decimal places');return n;}
export async function issueFinancialDocument(kind:string,source:string|null,snapshot:FinancialSnapshot,links:any,user:any){
 const client=await pool.connect();try{await client.query('BEGIN');
 const result=await client.query(`INSERT INTO financial_documents(kind,source_key,snapshot,tenant_id,landlord_id,property_id,rent_payment_id,allocation_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(source_key) DO NOTHING RETURNING *`,[kind,source,JSON.stringify(snapshot),links.tenant_id||null,links.landlord_id||null,links.property_id||null,links.rent_payment_id||null,links.allocation_id||null,user.id]);
 const row=result.rows[0]||(await client.query('SELECT * FROM financial_documents WHERE source_key=$1',[source])).rows[0];
 if(result.rows.length)await client.query(`INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'invoice_created','financial_document',$3,$4)`,[user.id,user.email,row.id,JSON.stringify({kind,number:financialNumber(row),amount:snapshot.amount})]);
 await client.query('COMMIT');return {...row,number:financialNumber(row)};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export function registerFinancialDocuments(app:Express){
 const guards=[authMiddleware,requireFinance];
 app.get('/api/financial-documents/records/:entity/:id',...guards,async(req,res)=>{
 if(!['tenant','landlord'].includes(String(req.params.entity)))return res.sendStatus(400);
 const field=req.params.entity==='tenant'?'tenant_id':'landlord_id';
 const rows=await query(`SELECT d.*,a.reversed_at FROM financial_documents d LEFT JOIN bank_feed_allocations a ON a.id=d.allocation_id WHERE (d.${field}=$1 ${req.params.entity==='tenant'?`OR (d.kind='rent_invoice' AND (EXISTS(SELECT 1 FROM rent_payments payment JOIN tenancy_billing_profiles profile ON profile.id=payment.tenancy_profile_id WHERE payment.id=d.rent_payment_id AND $1=ANY(profile.tenant_ids)) OR EXISTS (SELECT 1 FROM tenants owner JOIN tenants joint ON joint.id=owner.linked_tenant_id AND joint.property_id=owner.property_id AND joint.tenancy_start_date=owner.tenancy_start_date WHERE owner.id=d.tenant_id AND joint.id=$1 AND d.property_id=owner.property_id AND NOT EXISTS(SELECT 1 FROM rent_payments payment WHERE payment.id=d.rent_payment_id AND payment.tenancy_profile_id IS NOT NULL))))`:''}) ORDER BY d.created_at DESC,d.id DESC`,[req.params.id]);
 res.json(rows.map(r=>({...r,number:financialNumber(r)})));
 });
 app.post('/api/rent-payments/:id/invoice',...guards,requirePermission('staff'),async(req:AuthRequest,res)=>{try{
 const r=await rentInvoiceSource(Number(req.params.id));if(!r)return res.sendStatus(404);
 const s=rentInvoiceSnapshot(r);
 res.json(await issueFinancialDocument('rent_invoice','rent:'+r.id,s,{tenant_id:r.tenant_id,landlord_id:r.landlord_id,property_id:r.property_id,rent_payment_id:r.id},req.user));
 }catch(e){res.status(400).json({error:e.message});}});
 app.post('/api/landlords/:id/invoices',...guards,requirePermission('staff'),async(req:AuthRequest,res)=>{try{
 const l=await queryOne('SELECT * FROM landlords WHERE id=$1',[req.params.id]);if(!l)return res.sendStatus(404);
 const description=String(req.body.description||'').trim();if(!description||description.length>1200)throw Error('Enter invoice details (up to 1,200 characters)');
 const due=String(req.body.due_date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due)))throw Error('Choose a due date');
 const key=String(req.body.request_id||'');if(!/^[a-zA-Z0-9-]{16,80}$/.test(key))throw Error('A request identifier is required');
 res.json(await issueFinancialDocument('landlord_invoice',`landlord:${l.id}:${key}`,{recipient:l.name,recipient_address:l.address||'',property:'',description,amount:validInvoiceAmount(req.body.amount),date:new Date().toISOString(),due_date:due},{landlord_id:l.id},req.user));
 }catch(e){res.status(400).json({error:e.message});}});
 app.get('/api/landlords/:id/remittances',...guards,async(req,res)=>{
 res.json(await query(`SELECT a.id,a.amount,b.booked_at,p.address,p.postcode FROM bank_feed_allocations a JOIN bank_feed_transactions b ON b.id=a.bank_transaction_id JOIN properties p ON p.id=a.property_id WHERE p.landlord_id=$1 AND a.kind='financial' AND a.category='Landlord Rent Remittance' AND a.reversed_at IS NULL AND b.amount<0 ORDER BY b.booked_at DESC`,[req.params.id]));
 });
 app.post('/api/remittances/:id/document',...guards,requirePermission('staff'),async(req:AuthRequest,res)=>{try{
 const r=await queryOne(`SELECT a.*,b.booked_at,p.address,p.postcode,p.landlord_id,l.name,l.address landlord_address FROM bank_feed_allocations a JOIN bank_feed_transactions b ON b.id=a.bank_transaction_id JOIN properties p ON p.id=a.property_id JOIN landlords l ON l.id=p.landlord_id WHERE a.id=$1 AND a.kind='financial' AND a.category='Landlord Rent Remittance' AND a.reversed_at IS NULL AND b.amount<0`,[req.params.id]);
 if(!r)return res.status(404).json({error:'An active outgoing landlord remittance allocation is required'});
 const property=[r.address,r.postcode].filter(Boolean).join(', ');
 res.json(await issueFinancialDocument('remittance','remittance:'+r.id,{recipient:r.name,recipient_address:r.landlord_address||'',property,description:r.notes||'Rent payment remitted to landlord',amount:Number(r.amount),date:new Date().toISOString(),paid_at:r.booked_at},{landlord_id:r.landlord_id,property_id:r.property_id,allocation_id:r.id},req.user));
 }catch(e){res.status(400).json({error:e.message});}});
 app.get('/api/financial-documents/:id/pdf',...guards,async(req,res)=>{
 const row=await queryOne(`SELECT d.*,a.reversed_at FROM financial_documents d LEFT JOIN bank_feed_allocations a ON a.id=d.allocation_id WHERE d.id=$1`,[req.params.id]);if(!row)return res.sendStatus(404);
 if(row.rent_payment_id){const rent=await rentInvoiceSource(row.rent_payment_id);if(rent)row.snapshot={...row.snapshot,amount:row.snapshot.amount,paid_amount:Number(rent.amount_paid||0),paid_at:rent.payment_date};}
 const pdf=await financialDocumentPdf({...row,reversed:!!row.reversed_at});res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${financialNumber(row)}.pdf"`,'Cache-Control':'private, no-store'}).send(pdf);
 });
}

export async function rentInvoiceSource(id:number){const row=await queryOne(`SELECT r.*,profile.invoice_source,t.name,(SELECT jt.name FROM tenants jt WHERE jt.id=t.linked_tenant_id AND jt.property_id=r.property_id AND jt.property_id=t.property_id AND jt.tenancy_start_date=t.tenancy_start_date) AS joint_name,t.current_address,t.last_name_1,t.tenancy_start_date,t.rent_due_day,p.address,p.postcode,p.landlord_id,p.service_type,l.landlord_type,a.agreement_details FROM rent_payments r LEFT JOIN tenancy_billing_profiles profile ON profile.id=r.tenancy_profile_id JOIN tenants t ON t.id=r.tenant_id JOIN properties p ON p.id=r.property_id JOIN landlords l ON l.id=p.landlord_id LEFT JOIN LATERAL (SELECT agreement_details FROM tenancy_agreements a WHERE a.property_id=r.property_id AND (a.tenant_id=t.id OR a.joint_tenant_id=t.id OR a.enquiry_id=t.source_enquiry_id) AND a.status<>'void' ORDER BY a.id DESC LIMIT 1) a ON true WHERE r.id=$1`,[id]);return row?.invoice_source?{...row,...row.invoice_source}:row;}
export function rentInvoiceSnapshot(r:any):FinancialSnapshot{
 const property=rentPropertyAddress(r.address,r.postcode),dates=rentInvoiceDates(String(r.due_date),r.rent_due_day||Number(String(r.tenancy_start_date||'').slice(8,10))||undefined),details=typeof r.agreement_details==='string'?JSON.parse(r.agreement_details):r.agreement_details||{};
 const route=resolvePaymentRoute(resolveAgreementType(r.landlord_type),r.service_type);const bank=route==='landlord'?details.bankDetails:bankDetailsForRoute(route);
 const format=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'});
 return {invoice_reference:r.freeagent_invoice_reference||undefined,freeagent_invoice_url:r.freeagent_invoice_url||undefined,recipient:[r.name,r.joint_name].filter(name=>typeof name==='string'&&name.trim()).join(' & '),recipient_address:r.current_address||property,property,description:`Monthly rent for ${property}\n\nRental period: ${format(dates.period_start)} to ${format(dates.period_end)}`,amount:validInvoiceAmount(r.amount_due),date:dates.due_date,...dates,own_rent:r.landlord_type==='internal',payment_reference:details.paymentReference||rentPaymentReference(r.address,r.postcode,r.last_name_1||String(r.name).trim().split(/\s+/).slice(-1)[0]),bank_details:bank};
}
