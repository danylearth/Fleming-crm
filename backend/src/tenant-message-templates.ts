import {emailTemplateLibrary,fillEmailTemplate} from './message-template-library';
import type {Express} from 'express';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import {query,queryOne} from './db-pg';
import {normalizePropertyAddress,rentReminderEmail,tenancyEndEmail} from './email';
export async function rentReminderRecipients(tenant:any){
 if(!tenant.property_id||!tenant.tenancy_start_date)return [tenant];
 const partners=await query(`SELECT * FROM tenants WHERE id<>$1 AND (id=$2 OR linked_tenant_id=$1) AND property_id=$3 AND tenancy_start_date=$4 AND COALESCE(status,'active')<>'inactive' ORDER BY id`,[tenant.id,tenant.linked_tenant_id||null,tenant.property_id,tenant.tenancy_start_date]);
 return [tenant,...partners];
}
export function rentReminderTemplate(tenant:any,rent:any,address:string){
 const name=String(tenant.name||'there').split(' ')[0],due=String(rent.due_date).slice(0,10),amount=Number(rent.amount_due)-Number(rent.amount_paid||0);
 return {...rentReminderEmail(name,amount,address,due),sms:`Hi ${name}, your rent payment for ${address}, due ${new Date(due+'T12:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}, has an outstanding balance of £${amount.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}. Please arrange payment as soon as possible. If you have already paid, please contact Fleming Lettings on 01902 212 415 so we can update our records.`};
}
export function registerTenantMessageTemplates(app:Express){
 app.get('/api/tenants/:id/message-templates',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const tenant=await queryOne('SELECT t.*,p.address AS property_address,p.postcode AS property_postcode,p.city AS property_city FROM tenants t LEFT JOIN properties p ON p.id=t.property_id WHERE t.id=$1',[req.params.id]);
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  tenant.address=normalizePropertyAddress(tenant.property_address,tenant.property_postcode,tenant.property_city)||'Property not linked — contact the office';
  const recipients=await rentReminderRecipients(tenant);
  const rows=await query(`SELECT * FROM rent_payments WHERE tenant_id=ANY($1::int[]) AND due_date<=CURRENT_DATE AND ($2::int IS NULL OR id=$2) AND amount_due>COALESCE(amount_paid,0) ORDER BY due_date`,[recipients.map(r=>r.id),Number(req.query.rent_payment_id)||null]);
  const name=tenant.name.split(' ')[0],templates:any[]=[];
  for(const rent of rows){const due=String(rent.due_date).slice(0,10);templates.push({id:`rent-${rent.id}`,label:`Rent Payment Reminder · ${new Date(due+'T12:00Z').toLocaleDateString('en-GB')}`,...rentReminderTemplate(tenant,rent,tenant.address),recipients:recipients.map(r=>({id:r.id,name:r.name,email:r.email,phone:r.phone,...rentReminderTemplate(r,rent,tenant.address)}))});}
  if(tenant.tenancy_end_date)templates.push({id:'tenancy-end',label:'Tenancy End Reminder',...tenancyEndEmail(name,tenant.address,String(tenant.tenancy_end_date).slice(0,10))});
  const address=tenant.address||'';const parts=address.split(',');
  const values:Record<string,string>={FIRST_NAME:name,TENANT_NAME:tenant.name,PROPERTY_ADDRESS:address,PROPERTY_SHORT_ADDRESS:parts[0],PROPERTY_ADDRESS_REMAINDER:parts.slice(1).join(',').trim(),PROPERTY_SUBJECT:address,MONTHLY_RENT:Number(tenant.monthly_rent||0).toFixed(2),SECURITY_DEPOSIT:Number(tenant.security_deposit_amount||0).toFixed(2),REPORT_URL:'https://apply.fleminglettings.co.uk/report'};
  if(tenant.tenancy_start_date)values.TENANCY_START_DATE=new Date(String(tenant.tenancy_start_date).slice(0,10)+'T12:00Z').toLocaleDateString('en-GB');
  if(tenant.tenancy_end_date)values.END_DATE=new Date(String(tenant.tenancy_end_date).slice(0,10)+'T12:00Z').toLocaleDateString('en-GB');
  const library=emailTemplateLibrary().map(t=>({...t,html:fillEmailTemplate(t.html,values)}));
  const smsTemplates=[...templates.filter(t=>t.sms),{id:'maintenance',label:'Report a Maintenance Issue',sms:`Hi ${name}, please report maintenance issues using https://apply.fleminglettings.co.uk/report. If you need help, call Fleming Lettings on 01902 212 415.`},{id:'follow-up',label:'General Follow Up',sms:`Hi ${name}, this is Fleming Lettings. Please contact our office on 01902 212 415 when convenient so we can follow up with you.`}];
  res.json({email:tenant.email,phone:tenant.phone,templates:req.query.rent_payment_id?templates.filter(t=>t.id.startsWith('rent-')):[...templates,...library],smsTemplates:req.query.rent_payment_id?smsTemplates.filter(t=>t.id.startsWith('rent-')):smsTemplates});
 });
}
