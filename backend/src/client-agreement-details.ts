import type {Express} from 'express';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import pool,{query,queryOne,run} from './db-pg';

export type ClientDetails = {
 landlordName:string;landlordAddress:string;companyNumber:string;landlordEmail:string;landlordPhone:string;
 serviceAddress:string;emergencyContact:string;directorName:string;depositScheme:string;
};
export function validateClientDetails(details:ClientDetails,isCompany:boolean):string|null {
 for(const [key,label] of Object.entries({landlordName:'landlord name',landlordAddress:isCompany?'registered address':'landlord address',landlordEmail:'landlord email',landlordPhone:'landlord phone',serviceAddress:'address for service in England or Wales',emergencyContact:'emergency contact',depositScheme:'deposit protection scheme'}))if(!details[key as keyof ClientDetails]?.trim())return `Enter the ${label}`;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.landlordEmail))return 'Enter a valid landlord email';
 if(isCompany&&!/^[A-Z0-9]{8}$/i.test(details.companyNumber))return 'Enter the 8-character company number';
 if(isCompany&&!details.directorName.trim())return 'Choose or enter the director signing on behalf of the company';
 return null;
}
export async function clientAgreementContext(enquiryId:number){
 const enquiry=await queryOne(`SELECT te.id,te.joint_partner_id,te.client_agreement_details,p.landlord_id,p.service_type,l.* FROM tenant_enquiries te JOIN properties p ON p.id=te.linked_property_id JOIN landlords l ON l.id=p.landlord_id WHERE te.id=$1`,[enquiryId]);
 if(!enquiry)return null;
 const canonicalId=enquiry.joint_partner_id?Math.min(enquiryId,enquiry.joint_partner_id):enquiryId;
 const saved=await queryOne('SELECT client_agreement_details FROM tenant_enquiries WHERE id=$1',[canonicalId]);
 const directors=await query('SELECT id,name,email,phone FROM directors WHERE landlord_id=$1 AND COALESCE(archived,0)=0 ORDER BY name',[enquiry.landlord_id]);
 const bank=await queryOne('SELECT * FROM landlord_bank_details WHERE landlord_id=$1',[enquiry.landlord_id]);
 const isCompany=enquiry.entity_type==='company';
 const defaults:ClientDetails={landlordName:enquiry.name||'',landlordAddress:enquiry.home_address||enquiry.address||'',companyNumber:enquiry.company_number||'',landlordEmail:enquiry.email||'',landlordPhone:enquiry.phone||'',serviceAddress:enquiry.home_address||enquiry.address||'',emergencyContact:enquiry.phone||'',directorName:directors.length===1?directors[0].name:'',depositScheme:''};
 if(!isCompany){defaults.companyNumber='';defaults.directorName='';}
 const stored=saved?.client_agreement_details;
 const details:ClientDetails=stored?.landlordId===enquiry.landlord_id?{...defaults,...stored.details}:defaults;
 if(!isCompany){details.companyNumber='';details.directorName='';}
 return {enquiryId:canonicalId,landlordId:enquiry.landlord_id,enabled:enquiry.landlord_type!=='internal',serviceType:enquiry.service_type,isCompany,defaults,details,directors,bank:bank||null,saved:stored?.landlordId===enquiry.landlord_id,ready:!validateClientDetails(details,isCompany)&&!!bank?.approved_at};
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
  const client=await pool.connect();try{await client.query('BEGIN');
   if(!(await client.query('SELECT id FROM landlords WHERE id=$1 FOR UPDATE',[req.params.id])).rows.length){await client.query('ROLLBACK');return res.sendStatus(404);}
   const result=await client.query(`INSERT INTO landlord_bank_details(landlord_id,account_name,sort_code,account_number,bank_name,approved_at,approved_by) VALUES($1,$2,$3,$4,$5,CASE WHEN $6 THEN NOW() END,CASE WHEN $6 THEN $7::integer END) ON CONFLICT(landlord_id) DO UPDATE SET account_name=$2,sort_code=$3,account_number=$4,bank_name=$5,approved_at=CASE WHEN $6 THEN NOW() END,approved_by=CASE WHEN $6 THEN $7::integer END,updated_at=NOW() RETURNING *`,[req.params.id,accountName,sortCode.replace(/(\d{2})(\d{2})(\d{2})/,'$1-$2-$3'),accountNumber,bankName,approved,req.user.id]);
   await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'bank_details_updated','landlord',$3,$4)",[req.user.id,req.user.email,req.params.id,JSON.stringify({details_approved:approved,account_ending:accountNumber.slice(-4)})]);await client.query('COMMIT');res.json(result.rows[0]);
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 });
 app.get('/api/tenant-enquiries/:id/client-agreement-details',authMiddleware,requirePermission('staff'),async(req,res)=>{const state=await clientAgreementContext(Number(req.params.id));if(!state)return res.status(409).json({error:'Link the property and landlord first'});res.json(state);});
 app.put('/api/tenant-enquiries/:id/client-agreement-details',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const state=await clientAgreementContext(Number(req.params.id));if(!state?.enabled)return res.status(409).json({error:'Client details require an external landlord'});
  const details=Object.fromEntries(Object.keys(state.defaults).map(key=>[key,String(req.body[key]??'').trim().slice(0,1000)])) as ClientDetails;
  const error=validateClientDetails(details,state.isCompany);if(error)return res.status(400).json({error});
  await run('UPDATE tenant_enquiries SET client_agreement_details=$1,updated_at=NOW() WHERE id=$2',[JSON.stringify({landlordId:state.landlordId,details}),state.enquiryId]);
  await run("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'client_agreement_details_saved','tenant_enquiry',$3,$4)",[req.user.id,req.user.email,state.enquiryId,JSON.stringify({landlord_id:state.landlordId,is_company:state.isCompany})]);res.json(await clientAgreementContext(state.enquiryId));
 });
}
