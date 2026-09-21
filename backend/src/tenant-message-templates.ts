import {emailTemplateLibrary,fillEmailTemplate} from './message-template-library';
import type {Express} from 'express';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import {query,queryOne} from './db-pg';
import {rentReminderEmail,tenancyEndEmail} from './email';
export function registerTenantMessageTemplates(app:Express){
 app.get('/api/tenants/:id/message-templates',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const tenant=await queryOne('SELECT t.*,p.address FROM tenants t LEFT JOIN properties p ON p.id=t.property_id WHERE t.id=$1',[req.params.id]);
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  const rows=await query(`SELECT * FROM rent_payments WHERE (tenant_id=$1 OR tenant_id IN(SELECT id FROM tenants WHERE id=$2 AND property_id=$3 AND tenancy_start_date=$4)) AND due_date<CURRENT_DATE AND amount_due>COALESCE(amount_paid,0) ORDER BY due_date`,[tenant.id,tenant.linked_tenant_id||null,tenant.property_id,tenant.tenancy_start_date]);
  const name=tenant.name.split(' ')[0],templates:any[]=[];
  for(const rent of rows){const due=String(rent.due_date).slice(0,10),email=rentReminderEmail(name,Number(rent.amount_due)-Number(rent.amount_paid||0),tenant.address,due);templates.push({id:`rent-${rent.id}`,label:`Overdue Rent · ${due}`,...email,sms:`Hi ${name}, our records show that your rent payment for ${new Date(due+'T12:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})} has not yet been received and is now overdue. Please arrange payment of the outstanding balance as soon as possible. If payment has already been made, please let us know so we can update our records.`});}
  if(tenant.tenancy_end_date)templates.push({id:'tenancy-end',label:'Tenancy End Reminder',...tenancyEndEmail(name,tenant.address,String(tenant.tenancy_end_date).slice(0,10))});
  const address=tenant.address||'';const parts=address.split(',');
  const values:Record<string,string>={FIRST_NAME:name,TENANT_NAME:tenant.name,PROPERTY_ADDRESS:address,PROPERTY_SHORT_ADDRESS:parts[0],PROPERTY_ADDRESS_REMAINDER:parts.slice(1).join(',').trim(),PROPERTY_SUBJECT:address,MONTHLY_RENT:Number(tenant.monthly_rent||0).toFixed(2),SECURITY_DEPOSIT:Number(tenant.security_deposit_amount||0).toFixed(2),REPORT_URL:'https://apply.fleminglettings.co.uk/report'};
  if(tenant.tenancy_start_date)values.TENANCY_START_DATE=new Date(String(tenant.tenancy_start_date).slice(0,10)+'T12:00Z').toLocaleDateString('en-GB');
  if(tenant.tenancy_end_date)values.END_DATE=new Date(String(tenant.tenancy_end_date).slice(0,10)+'T12:00Z').toLocaleDateString('en-GB');
  const library=emailTemplateLibrary().map(t=>({...t,html:fillEmailTemplate(t.html,values)}));
  const smsTemplates=[...templates.filter(t=>t.sms),{id:'maintenance',label:'Report a Maintenance Issue',sms:`Hi ${name}, please report maintenance issues using https://apply.fleminglettings.co.uk/report. If you need help, call Fleming Lettings on 01902 212 415.`},{id:'follow-up',label:'General Follow Up',sms:`Hi ${name}, this is Fleming Lettings. Please contact our office on 01902 212 415 when convenient so we can follow up with you.`}];
  res.json({email:tenant.email,phone:tenant.phone,templates:[...templates,...library],smsTemplates});
 });
}
