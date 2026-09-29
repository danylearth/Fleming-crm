import {serviceReadySql} from './service-workflow';
import type {Express} from 'express';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import pool,{query,queryOne,run} from './db-pg';
import {bankDetailsForRoute,resolvePaymentRoute} from './tenancy-agreement-pdf';
import {getCompanySettings} from './company-settings';
import {normaliseAgreementAccount,sameAgreementAccount,confirmedAgreementPayment,defaultAgreementPaymentInstructions} from './agreement-payment-confirmation';

export type ClientDetails = {
 landlordName:string;landlordAddress:string;companyNumber:string;landlordEmail:string;landlordPhone:string;
 serviceAddress:string;emergencyContact:string;directorName:string;depositScheme:string;bankAccountName?:string;bankSortCode?:string;bankAccountNumber?:string;
};
export function validateClientDetails(details:ClientDetails,isCompany:boolean):string|null {
 for(const [key,label] of Object.entries({landlordName:'landlord name',landlordAddress:isCompany?'registered address':'landlord address',landlordEmail:'landlord email',landlordPhone:'landlord phone',serviceAddress:'address for service in England or Wales',emergencyContact:'emergency contact'}))if(!details[key as keyof ClientDetails]?.trim())return `Enter the ${label}`;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.landlordEmail))return 'Enter a valid landlord email';
 if(isCompany&&!/^[A-Z0-9]{8}$/i.test(details.companyNumber))return 'Enter the 8-character company number';
 if([details.bankAccountName,details.bankSortCode,details.bankAccountNumber].some(Boolean)&&(!details.bankAccountName?.trim()||!/^\d{2}-?\d{2}-?\d{2}$/.test(details.bankSortCode||'')||!/^\d{8}$/.test(details.bankAccountNumber||'')))return 'Enter the tenancy bank account name, 6-digit sort code and 8-digit account number';
 if(isCompany&&!details.directorName.trim())return 'Choose or enter the director signing on behalf of the company';
 return null;
}
export async function clientAgreementContext(enquiryId:number){
 const enquiry=await queryOne(`SELECT te.id,te.joint_partner_id,te.client_agreement_details,${serviceReadySql()} AS service_ready,p.id AS service_property_id,p.landlord_id,p.service_type,l.* FROM tenant_enquiries te JOIN properties p ON p.id=te.linked_property_id JOIN landlords l ON l.id=p.landlord_id WHERE te.id=$1`,[enquiryId]);
 if(!enquiry)return null;
 const canonicalId=enquiry.joint_partner_id?Math.min(enquiryId,enquiry.joint_partner_id):enquiryId;
 const saved=await queryOne('SELECT client_agreement_details FROM tenant_enquiries WHERE id=$1',[canonicalId]);
 const directors=await query('SELECT id,name,email,phone FROM directors WHERE landlord_id=$1 AND COALESCE(archived,0)=0 ORDER BY name',[enquiry.landlord_id]);
 const masterBank=await queryOne('SELECT * FROM landlord_bank_details WHERE landlord_id=$1',[enquiry.landlord_id]);
 const isCompany=enquiry.entity_type==='company';
 const defaults:ClientDetails={landlordName:enquiry.name||'',landlordAddress:enquiry.home_address||enquiry.address||'',companyNumber:enquiry.company_number||'',landlordEmail:enquiry.email||'',landlordPhone:enquiry.phone||'',serviceAddress:enquiry.home_address||enquiry.address||'',emergencyContact:enquiry.phone||'',directorName:directors.length===1?directors[0].name:'',depositScheme:'',bankAccountName:'',bankSortCode:'',bankAccountNumber:''};
 if(!isCompany){defaults.companyNumber='';defaults.directorName='';}
 const stored=saved?.client_agreement_details;
 const details:ClientDetails=stored?.landlordId===enquiry.landlord_id?{...defaults,...stored.details}:defaults;
 if(!isCompany){details.companyNumber='';details.directorName='';}
 const service=await queryOne("SELECT bank_details,signed_at,signer_name,bank_changed,payment_route,setup_fee,monthly_fee FROM landlord_service_agreements WHERE property_id=$1 AND landlord_id=$2 AND service_type=$3 AND status='signed'",[enquiry.service_property_id,enquiry.landlord_id,enquiry.service_type]);
 const serviceBank=service?.bank_details?.account_number?{...service.bank_details,approved_at:null,landlord_approved_at:service.signed_at,landlord_approved_name:service.signer_name}:null;
 const hasOverride=!!details.bankAccountName;
 const bank=hasOverride?{account_name:details.bankAccountName,sort_code:details.bankSortCode,account_number:details.bankAccountNumber,bank_name:'',approved_at:stored?.bankOverrideApprovedAt||null}:masterBank||serviceBank;
 const paymentRoute=resolvePaymentRoute(enquiry.landlord_type==='internal'?'internal':'client',enquiry.service_type);
 const sourceBank=masterBank||serviceBank;
 const company=(await getCompanySettings()).data;
 let suggestedPaymentAccount=null;
 try{suggestedPaymentAccount=bankDetailsForRoute(paymentRoute,{accountName:sourceBank?.account_name,sortCode:sourceBank?.sort_code,accountNumber:sourceBank?.account_number,bankName:sourceBank?.bank_name},company);}catch{/* Incomplete bank records are shown as missing in the confirmation form. */}
 const matchingRecord=stored?.landlordId===enquiry.landlord_id&&(!stored.propertyId||stored.propertyId===enquiry.service_property_id);
 const paymentAccount=matchingRecord?confirmedAgreementPayment(stored?.paymentConfirmation,enquiry.service_type,suggestedPaymentAccount):null;
 const paymentOverride=Boolean(paymentAccount&&stored?.paymentConfirmation?.override);
 const defaultAccountApproved=paymentRoute!=='landlord'||Boolean(sourceBank?.approved_at&&sourceBank?.landlord_approved_at);
 const paymentReady=Boolean(paymentAccount&&(paymentOverride||defaultAccountApproved));
 return {propertyId:enquiry.service_property_id,serviceAgreementSigned:!!service,serviceAgreementReady:!!enquiry.service_ready,servicePaymentRoute:service?.payment_route,serviceSetupFee:service?.setup_fee,serviceMonthlyFee:service?.monthly_fee,bankOverride:hasOverride,enquiryId:canonicalId,landlordId:enquiry.landlord_id,enabled:enquiry.landlord_type!=='internal',serviceType:enquiry.service_type,isCompany,defaults,details,directors,bank:bank||null,saved:matchingRecord,paymentRoute,suggestedPaymentAccount,paymentAccount:paymentAccount||suggestedPaymentAccount,paymentConfirmed:paymentReady,paymentOverride,defaultAccountApproved,paymentInstructions:matchingRecord&&stored?.paymentInstructions||defaultAgreementPaymentInstructions(enquiry.service_type),companyAccounts:{business:company.operatingAccount,clientMoney:company.clientAccount,cmpNumber:company.cmp.number},ready:matchingRecord&&!validateClientDetails(details,isCompany)&&paymentReady};
}
export function registerClientAgreementDetails(app:Express){
 app.get('/api/landlords/:id/bank-details',authMiddleware,requirePermission('staff'),async(req,res)=>{
  if(!await queryOne('SELECT id FROM landlords WHERE id=$1',[req.params.id]))return res.sendStatus(404);
  res.json(await queryOne('SELECT b.*,u.name AS approved_by_name FROM landlord_bank_details b LEFT JOIN users u ON u.id=b.approved_by WHERE landlord_id=$1',[req.params.id])||{});
 });
 app.put('/api/landlords/:id/bank-details',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const accountName=String(req.body.account_name||'').trim(),sortCode=String(req.body.sort_code||'').replace(/[\s-]/g,''),accountNumber=String(req.body.account_number||'').trim(),bankName=String(req.body.bank_name||'').trim();
  if(!accountName||accountName.length>150||!/^\d{6}$/.test(sortCode)||!/^\d{8}$/.test(accountNumber)||bankName.length>150)return res.status(400).json({error:'Enter an account name, 6-digit sort code and 8-digit account number'});
  const approved=req.body.details_approved===true;
  if(approved&&req.user.role!=='admin')return res.status(403).json({error:'An administrator must approve bank details'});
  const verifiedWith=String(req.body.verified_with||'').trim(),verificationNote=String(req.body.verification_note||'').trim();
  if(approved&&(req.body.verification_method!=='phone_call'||!verifiedWith||verifiedWith.length>150||verificationNote.length>2000))return res.status(400).json({error:'Record who confirmed the bank details during the phone call'});
  const client=await pool.connect();try{await client.query('BEGIN');
   if(!(await client.query('SELECT id FROM landlords WHERE id=$1 FOR UPDATE',[req.params.id])).rows.length){await client.query('ROLLBACK');return res.sendStatus(404);}
   const current=(await client.query('SELECT * FROM landlord_bank_details WHERE landlord_id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(approved&&(!current||current.account_name!==accountName||current.sort_code.replace(/-/g,'')!==sortCode||current.account_number!==accountNumber||current.bank_name!==bankName)){await client.query('ROLLBACK');return res.status(409).json({error:'Bank details have changed. Reload and verify the current account before approving.'});}
   const result=await client.query(`INSERT INTO landlord_bank_details(landlord_id,account_name,sort_code,account_number,bank_name,approved_at,approved_by) VALUES($1,$2,$3,$4,$5,CASE WHEN $6 THEN NOW() END,CASE WHEN $6 THEN $7::integer END) ON CONFLICT(landlord_id) DO UPDATE SET account_name=$2,sort_code=$3,account_number=$4,bank_name=$5,approved_at=CASE WHEN $6 THEN NOW() END,approved_by=CASE WHEN $6 THEN $7::integer END,landlord_approved_at=CASE WHEN landlord_bank_details.account_name=$2 AND landlord_bank_details.sort_code=$3 AND landlord_bank_details.account_number=$4 AND landlord_bank_details.bank_name=$5 THEN landlord_bank_details.landlord_approved_at END,landlord_approved_name=CASE WHEN landlord_bank_details.account_name=$2 AND landlord_bank_details.sort_code=$3 AND landlord_bank_details.account_number=$4 AND landlord_bank_details.bank_name=$5 THEN landlord_bank_details.landlord_approved_name END,updated_at=NOW() RETURNING *`,[req.params.id,accountName,sortCode.replace(/(\d{2})(\d{2})(\d{2})/,'$1-$2-$3'),accountNumber,bankName,approved,req.user.id]);
   await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,'landlord',$4,$5)",[req.user.id,req.user.email,approved?'bank_details_approved':'bank_details_updated',req.params.id,JSON.stringify({details_approved:approved,account_ending:accountNumber.slice(-4),...(approved?{verification_method:'Phone call',verified_with:verifiedWith,verification_note:verificationNote}: {})})]);await client.query('COMMIT');res.json({...result.rows[0],approved_by_name:approved?(await queryOne('SELECT name FROM users WHERE id=$1',[req.user.id]))?.name:null});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 });
 app.get('/api/tenant-enquiries/:id/client-agreement-details',authMiddleware,requirePermission('staff'),async(req,res)=>{const state=await clientAgreementContext(Number(req.params.id));if(!state)return res.status(409).json({error:'Link the property and landlord first'});res.json(state);});
 app.put('/api/tenant-enquiries/:id/client-agreement-details',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const state=await clientAgreementContext(Number(req.params.id));if(!state?.enabled)return res.status(409).json({error:'Client details require an external landlord'});
  const details=Object.fromEntries(Object.keys(state.defaults).map(key=>[key,String(req.body[key]??'').trim().slice(0,1000)])) as ClientDetails;
  const error=validateClientDetails(details,state.isCompany);if(error)return res.status(400).json({error});
  const paymentInstructions=String(req.body.payment_instructions??state.paymentInstructions).trim();
  if(!paymentInstructions||paymentInstructions.length>2000)return res.status(400).json({error:'Enter payment instructions of up to 2,000 characters'});
  if(details.bankAccountName&&req.body.bank_override_approved!==true)return res.status(400).json({error:'Confirm the alternative bank details for this tenancy'});
  let paymentConfirmation=null;
  if(req.body.payment_confirmed===true){
   let account;try{account=normaliseAgreementAccount(req.body.payment_account);}catch(error){return res.status(400).json({error:(error as Error).message});}
   const override=!sameAgreementAccount(account,state.suggestedPaymentAccount);
   if(override&&req.body.payment_override_approved!==true)return res.status(400).json({error:'Confirm the changed payment account in the confirmation window'});
   if(!override&&!state.defaultAccountApproved)return res.status(409).json({error:'The landlord bank details require approval on the landlord record before they can be confirmed'});
   paymentConfirmation={account,override,serviceType:state.serviceType,confirmedAt:new Date().toISOString(),confirmedBy:req.user.id};
  }
  const client=await pool.connect();try{await client.query('BEGIN');
   await client.query('UPDATE tenant_enquiries SET client_agreement_details=$1,updated_at=NOW() WHERE id=$2',[JSON.stringify({landlordId:state.landlordId,propertyId:state.propertyId,details,paymentConfirmation,paymentInstructions,bankOverrideApprovedAt:details.bankAccountName?new Date().toISOString():null,bankOverrideApprovedBy:details.bankAccountName?req.user.id:null}),state.enquiryId]);
   await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'client_agreement_details_saved','tenant_enquiry',$3,$4)",[req.user.id,req.user.email,state.enquiryId,JSON.stringify({landlord_id:state.landlordId,is_company:state.isCompany,payment_confirmed:!!paymentConfirmation,payment_override:paymentConfirmation?.override||false,account_ending:paymentConfirmation?.account.accountNumber.slice(-4)})]);await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  res.json(await clientAgreementContext(state.enquiryId));
 });
}
