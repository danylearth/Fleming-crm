import type {Express} from 'express';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import pool,{queryOne,run} from './db-pg';
import {brandedEmailHtml,sendEmail,OUTBOUND_EMAIL_ADDRESS} from './email';
import {sendSms,normalizeUkPhone,SMS_FROM} from './sms';
export function appointmentDetails(body:any,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date())){
 const {kind,date,time}=body,location=String(body.location||'').trim();
 if(!['meeting','follow_up'].includes(kind))throw Error('Choose a meeting or follow-up');
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<today)throw Error('Choose today or a future date');
 if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Choose a valid time');
 if(kind==='meeting'&&(!time||!location))throw Error('Enter a meeting time and location');
 return {kind,date,time:time||'',location:location.slice(0,500),assigned_to:body.assigned_to?Number(body.assigned_to):null};
}
export function appointmentMessage(name:string,details:ReturnType<typeof appointmentDetails>){
 const day=new Date(details.date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'});
 return `Hi ${name}, ${details.kind==='meeting'?'your meeting with Fleming Lettings is booked':'we will follow up with you'} on ${day}${details.time?' at '+details.time+' (UK time)':''}${details.kind==='meeting'?' at '+details.location:''}. If you need to rearrange, please contact us on 01902 212 415. Fleming Lettings.`;
}
export function registerLandlordAppointments(app:Express){
 app.post('/api/landlords-bdm/:id/appointment',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  let details:ReturnType<typeof appointmentDetails>;
  try{details=appointmentDetails(req.body);}catch(e){return res.status(400).json({error:(e as Error).message});}
  const requestId=String(req.body.request_id||'');if(!/^[0-9a-f-]{36}$/i.test(requestId))return res.status(400).json({error:'A request ID is required'});
  const prospect=await queryOne('SELECT * FROM landlords_bdm WHERE id=$1',[req.params.id]);if(!prospect)return res.sendStatus(404);
  if(['onboarded','not_interested'].includes(prospect.status))return res.status(409).json({error:'This enquiry is closed'});
  if(details.assigned_to&&(!Number.isInteger(details.assigned_to)||!await queryOne("SELECT id FROM users WHERE id=$1 AND is_active=1 AND role IN ('admin','manager','staff')",[details.assigned_to])))return res.status(400).json({error:'Choose an active staff member'});
  if(req.body.send_email&&!prospect.email||req.body.send_sms&&!prospect.phone)return res.status(400).json({error:'Add the recipient contact details first'});
  const c=await pool.connect();let appointmentId:number;
  const text=appointmentMessage(prospect.name,details),subject=details.kind==='meeting'?'Your Fleming Lettings meeting':'Fleming Lettings follow-up';
  try{
   await c.query('BEGIN');const locked=(await c.query('SELECT status FROM landlords_bdm WHERE id=$1 FOR UPDATE',[prospect.id])).rows[0];
   if(!locked||['onboarded','not_interested'].includes(locked.status)){await c.query('ROLLBACK');return res.status(409).json({error:'This enquiry is closed'});}
   const existing=(await c.query('SELECT id,delivery FROM landlord_appointments WHERE request_id=$1 AND enquiry_id=$2',[requestId,prospect.id])).rows[0];
   if(existing){await c.query('COMMIT');return res.json({id:existing.id,delivery:existing.delivery,already_saved:true});}
   appointmentId=(await c.query('INSERT INTO landlord_appointments(enquiry_id,request_id,kind,appointment_date,appointment_time,location,assigned_to,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[prospect.id,requestId,details.kind,details.date,details.time||null,details.location||null,details.assigned_to,req.user.id])).rows[0].id;
   await c.query("UPDATE tasks SET status='completed' WHERE entity_type='landlord_bdm' AND entity_id=$1 AND task_type=$2 AND status IN ('pending','in_progress')",[prospect.id,'landlord_'+details.kind]);
   await c.query("INSERT INTO tasks(title,description,task_type,entity_type,entity_id,due_date,assigned_to,status,priority) VALUES($1,$2,$3,'landlord_bdm',$4,$5,$6,'pending','medium')",[(details.kind==='meeting'?'Landlord Meeting':'Landlord Follow-up')+' — '+prospect.name,text,'landlord_'+details.kind,prospect.id,details.date,details.assigned_to]);
   await c.query("UPDATE landlords_bdm SET status='follow_up',follow_up_date=$1,updated_at=NOW() WHERE id=$2",[details.date,prospect.id]);
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','landlord_bdm',$3,$4)",[req.user.id,req.user.email,prospect.id,JSON.stringify({appointment_id:appointmentId,...details})]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');return res.status(400).json({error:'Appointment could not be saved'});}finally{c.release();}
  // A saved request is never sent again on a network retry (especially SMS).
  const delivery:Record<string,unknown>={};
  try{
   if(req.body.send_email){const escaped=text.replace(/[&<>"']/g,v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]!));const html=brandedEmailHtml(subject,'<p>'+escaped+'</p>');const r=await sendEmail({to:prospect.email,subject,html,idempotencyKey:'landlord-appointment-'+requestId});delivery.email=r;await run("INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,body_html,status,error_message) VALUES($1,'landlord_bdm',$2,$3,$4,$5,$6,$7,$8)",[r.id||null,prospect.id,prospect.email,OUTBOUND_EMAIL_ADDRESS,subject,html,r.simulated?'simulated':r.success?'sent':'failed',r.error||null]);}
   if(req.body.send_sms){const phone=normalizeUkPhone(prospect.phone),r=await sendSms({to:phone,body:text});delivery.sms=r;await run("INSERT INTO sms_messages(entity_type,entity_id,to_phone,from_phone,message_body,status,twilio_sid,error_message,sent_by) VALUES('landlord_bdm',$1,$2,$3,$4,$5,$6,$7,$8)",[prospect.id,phone,SMS_FROM,text,r.simulated?'simulated':r.success?'sent':'failed',r.sid||null,r.error||null,req.user.id]);}
   await run('UPDATE landlord_appointments SET delivery=$1 WHERE id=$2',[JSON.stringify(delivery),appointmentId]);
  }catch{delivery.warning='Appointment saved. Communication tracking was interrupted; check communications before resending.';}
  res.status(201).json({id:appointmentId,delivery});
 });
}
