import type {Express} from 'express';
import crypto from 'crypto';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import pool,{query,queryOne,run} from './db-pg';
import {sendEmail,OUTBOUND_EMAIL_ADDRESS} from './email';
import {sendSms,normalizeUkPhone} from './sms';
const base=process.env.BASE_URL||'https://fleming-crm-api.fly.dev';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const marketingDestination=(channel:string,value:string)=>channel==='email'?value.trim().toLowerCase():normalizeUkPhone(value);
export const csvCell=(value:unknown)=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
export async function marketingContacts(){return query(`
 SELECT 'landlord' AS entity_type,id,name,email,phone,'Live Landlords' AS audience FROM landlords
 UNION ALL SELECT 'landlord_bdm',id,name,email,phone,CASE WHEN status IN ('onboarded','not_interested','rejected','closed') THEN 'Closed Landlord Enquiries' ELSE 'Landlord Enquiries' END FROM landlords_bdm
 UNION ALL SELECT 'tenant',id,name,email,phone,CASE WHEN COALESCE(status,'active')='inactive' THEN 'Former Tenants' ELSE 'Live Tenants' END FROM tenants
 UNION ALL SELECT 'tenant_enquiry',id,CONCAT_WS(' ',first_name_1,last_name_1),email_1,phone_1,CASE WHEN status IN ('converted','rejected','closed') THEN 'Closed Tenant Enquiries' ELSE 'Tenant Enquiries' END FROM tenant_enquiries
 ORDER BY audience,name`);}
const audit=async(req:AuthRequest,action:string,id:number|null,changes:unknown)=>run('INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',[req.user.id,req.user.email,action,'marketing',id,JSON.stringify(changes)]);
let running=false;
export async function processMarketing(){
 if(running)return;running=true;
 try{
  for(let count=0;count<20;count++){
   const c=await pool.connect();let recipient:any;
   try{await c.query('BEGIN');recipient=(await c.query(`SELECT r.*,c.channel,c.subject,c.message,c.created_by,u.email AS sender_email FROM marketing_recipients r JOIN marketing_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.created_by WHERE c.status='sending' AND r.status='pending' ORDER BY r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1`)).rows[0];
    if(recipient)await c.query("UPDATE marketing_recipients SET status='sending' WHERE id=$1",[recipient.id]);await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   if(!recipient)break;
   try{
    const permission=await queryOne('SELECT * FROM marketing_permissions WHERE channel=$1 AND destination=$2',[recipient.channel,recipient.destination]);
    if(!permission?.allowed){await run("UPDATE marketing_recipients SET status='skipped',error='Marketing permission missing or withdrawn' WHERE id=$1",[recipient.id]);continue;}
    const url=`${base}/api/public/marketing/unsubscribe/${permission.unsubscribe_token}`;
    const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202020"><h2>Fleming Lettings</h2><p>Hi ${esc(recipient.name)},</p><div style="white-space:pre-wrap">${esc(recipient.message)}</div><p><a href="${url}">Unsubscribe from marketing emails</a></p><p>Fleming Lettings · 01902 212 415</p></body></html>`;
    const sms=`Fleming Lettings: ${recipient.message}\nOpt out: ${url}`;
    const result=recipient.channel==='email'?await sendEmail({to:recipient.destination,subject:recipient.subject,html,idempotencyKey:`marketing-${recipient.campaign_id}-${recipient.id}`}):await sendSms({to:recipient.destination,body:sms});
    const providerId=(result as any).id||(result as any).sid||null;
    const status=result.simulated?'simulated':result.success?'sent':'failed';
    if(recipient.channel==='email')await run(`INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,sent_by,sent_by_email,error_message) VALUES($1,$2,$3,$4,$5,$6,'marketing',$7,$8,$9,$10,$11)`,[providerId,recipient.entity_type,recipient.entity_id,recipient.destination,OUTBOUND_EMAIL_ADDRESS,recipient.subject,html,status,recipient.created_by,recipient.sender_email,result.error||null]);
    else await run(`INSERT INTO sms_messages(entity_type,entity_id,to_phone,message_body,status,twilio_sid,error_message,sent_by,sent_by_email) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[recipient.entity_type,recipient.entity_id,recipient.destination,sms,status,providerId,result.error||null,recipient.created_by,recipient.sender_email]);
    await run('UPDATE marketing_recipients SET status=$1,error=$2,provider_id=$3,sent_at=NOW() WHERE id=$4',[status,result.error||null,providerId,recipient.id]);
   }catch{await run("UPDATE marketing_recipients SET status='unknown',error='Delivery could not be confirmed. Check provider history before retrying.' WHERE id=$1",[recipient.id]);}
  }
  await run(`UPDATE marketing_campaigns c SET status=CASE WHEN EXISTS(SELECT 1 FROM marketing_recipients r WHERE r.campaign_id=c.id AND r.status IN ('failed','unknown')) THEN 'completed_with_errors' ELSE 'completed' END WHERE status='sending' AND NOT EXISTS(SELECT 1 FROM marketing_recipients r WHERE r.campaign_id=c.id AND r.status IN ('pending','sending'))`);
 }finally{running=false;}
}
export function registerMarketing(app:Express){
 app.get('/api/marketing/contacts',authMiddleware,requirePermission('manager'),async(req,res)=>{const rows=await marketingContacts(),permissions=await query('SELECT channel,destination,allowed,evidence FROM marketing_permissions');res.json(rows.map(row=>({...row,email_allowed:permissions.some(p=>p.channel==='email'&&p.destination===marketingDestination('email',row.email||'')&&p.allowed),sms_allowed:permissions.some(p=>p.channel==='sms'&&p.destination===marketingDestination('sms',row.phone||'')&&p.allowed)})));});
 app.put('/api/marketing/permission',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{
  const {channel,allowed,evidence}=req.body;if(!['email','sms'].includes(channel)||typeof allowed!=='boolean'||(allowed&&(!evidence||String(evidence).trim().length<10)))return res.status(400).json({error:'Choose a channel and record how and when permission was obtained'});
  const destination=marketingDestination(channel,String(req.body.destination||''));if(!destination||(channel==='email'?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination):!/^\+\d{10,15}$/.test(destination)))return res.status(400).json({error:'Enter a valid contact address'});
  await run(`INSERT INTO marketing_permissions(channel,destination,allowed,evidence,updated_by,unsubscribe_token) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(channel,destination) DO UPDATE SET allowed=$3,evidence=$4,updated_by=$5,updated_at=NOW()`,[channel,destination,allowed,String(evidence||'').slice(0,4000),req.user.id,crypto.randomUUID()]);await audit(req,'marketing_permission',null,{channel,destination,allowed,evidence});res.json({success:true});
 });
 app.get('/api/marketing/export',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{const rows=await marketingContacts();const filtered=req.query.audience?rows.filter(r=>r.audience===req.query.audience):rows;await audit(req,'export',null,{count:filtered.length,audience:req.query.audience||'All'});res.setHeader('Content-Disposition','attachment; filename="fleming-marketing-contacts.csv"');res.type('text/csv').send('\uFEFF'+[['Audience','Name','Email','Phone','Record type','Record ID'],...filtered.map(r=>[r.audience,r.name,r.email,r.phone,r.entity_type,r.id])].map(r=>r.map(csvCell).join(',')).join('\r\n'));});
 app.get('/api/marketing/campaigns',authMiddleware,requirePermission('manager'),async(req,res)=>res.json(await query(`SELECT c.*,COALESCE((SELECT json_agg(json_build_object('status',t.status,'count',t.n)) FROM (SELECT status,count(*)::int n FROM marketing_recipients WHERE campaign_id=c.id GROUP BY status)t),'[]') AS counts FROM marketing_campaigns c ORDER BY created_at DESC LIMIT 100`)));
 app.post('/api/marketing/campaigns',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{
  const {channel,subject,message,recipients}=req.body;if(!['email','sms'].includes(channel)||typeof message!=='string'||!message.trim()||message.length>(channel==='sms'?1000:20000)||(channel==='email'&&(!subject||String(subject).length>200))||!Array.isArray(recipients)||!recipients.length||recipients.length>1000)return res.status(400).json({error:'Choose recipients and enter a message (SMS up to 1,000 characters; email up to 20,000)'});
  const contacts=await marketingContacts();const chosen=contacts.filter(c=>recipients.includes(`${c.entity_type}:${c.id}`));const unique=new Map<string,any>();
  for(const c of chosen){const dest=marketingDestination(channel,String(channel==='email'?c.email||'':c.phone||''));if(dest)unique.set(dest,c);}
  if(!unique.size)return res.status(400).json({error:'The selected contacts have no valid destinations'});
  const c=await pool.connect();const id=crypto.randomUUID();try{await c.query('BEGIN');
   for(const dest of unique.keys()){const permitted=(await c.query('SELECT allowed FROM marketing_permissions WHERE channel=$1 AND destination=$2',[channel,dest])).rows[0];if(!permitted?.allowed){await c.query('ROLLBACK');return res.status(409).json({error:'Record marketing permission for each recipient before creating this campaign'});}}
   await c.query('INSERT INTO marketing_campaigns(id,name,channel,subject,message,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id,String(req.body.name||subject||'SMS Campaign').slice(0,200),channel,subject||null,message.trim(),req.user.id]);
   for(const [dest,r] of unique)await c.query('INSERT INTO marketing_recipients(campaign_id,entity_type,entity_id,name,destination) VALUES($1,$2,$3,$4,$5)',[id,r.entity_type,r.id,r.name,dest]);
   await c.query('COMMIT');await audit(req,'campaign_created',null,{campaign_id:id,channel,recipients:unique.size});res.status(201).json({id,count:unique.size});
  }catch{await c.query('ROLLBACK');res.status(500).json({error:'Campaign could not be saved'});}finally{c.release();}
 });
 app.get('/api/marketing/campaigns/:id',authMiddleware,requirePermission('manager'),async(req,res)=>{const campaign=await queryOne('SELECT * FROM marketing_campaigns WHERE id=$1',[req.params.id]);if(!campaign)return res.sendStatus(404);res.json({...campaign,recipients:await query('SELECT * FROM marketing_recipients WHERE campaign_id=$1 ORDER BY id',[campaign.id])});});
 app.post('/api/marketing/campaigns/:id/send',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{const row=await queryOne("UPDATE marketing_campaigns SET status='sending',started_at=NOW() WHERE id=$1 AND status='draft' RETURNING id",[req.params.id]);if(!row)return res.status(409).json({error:'This campaign has already been queued or sent'});await audit(req,'campaign_started',null,{campaign_id:row.id});res.status(202).json({success:true});void processMarketing().catch(()=>console.error('Marketing worker failed'));});
 app.get('/api/public/marketing/unsubscribe/:token',async(req,res)=>{if(!/^[a-f0-9-]{36}$/i.test(String(req.params.token)))return res.sendStatus(404);const p=await queryOne('SELECT channel FROM marketing_permissions WHERE unsubscribe_token=$1',[req.params.token]);if(!p)return res.sendStatus(404);res.type('html').send(`<!doctype html><html><body style="font-family:Arial;padding:40px"><h1>Fleming Lettings</h1><p>Unsubscribe from marketing ${p.channel==='email'?'emails':'texts'}.</p><form method="post"><button type="submit">Confirm unsubscribe</button></form></body></html>`);});
 app.post('/api/public/marketing/unsubscribe/:token',async(req,res)=>{if(!/^[a-f0-9-]{36}$/i.test(String(req.params.token)))return res.sendStatus(404);const p=await queryOne('UPDATE marketing_permissions SET allowed=FALSE,evidence=$1,updated_at=NOW(),updated_by=NULL WHERE unsubscribe_token=$2 RETURNING channel,destination',["Recipient unsubscribed",req.params.token]);if(!p)return res.sendStatus(404);await run("INSERT INTO audit_log(action,entity_type,changes) VALUES('marketing_unsubscribe','marketing',$1)",[JSON.stringify(p)]);res.type('html').send('<h1>You are unsubscribed</h1><p>Fleming Lettings will no longer send marketing through this channel.</p>');});
 if(process.env.NODE_ENV==='production'){void run("UPDATE marketing_recipients SET status='unknown',error='Delivery interrupted. Check provider history before retrying.' WHERE status='sending'").then(()=>processMarketing()).catch(()=>console.error('Marketing recovery failed'));const timer=setInterval(()=>void processMarketing().catch(()=>console.error('Marketing worker failed')),15000);timer.unref();}
}
