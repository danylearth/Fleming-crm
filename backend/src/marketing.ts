import {registerMarketingFiles,campaignAttachments,marketingRoot,allowedMarketingSender} from './marketing-files';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import {emailTemplateLibrary,templateAssets,fillEmailTemplate} from './message-template-library';
import {cleanMarketingHtml,marketingEmailHtml} from './marketing-html';
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
   try{await c.query('BEGIN');recipient=(await c.query(`SELECT r.*,c.channel,c.subject,c.message,c.message_format,c.from_email,c.attachment_ids,c.created_by,u.email AS sender_email FROM marketing_recipients r JOIN marketing_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.created_by WHERE c.status='sending' AND r.status='pending' ORDER BY r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1`)).rows[0];
    if(recipient)await c.query("UPDATE marketing_recipients SET status='sending' WHERE id=$1",[recipient.id]);await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   if(!recipient)break;
   try{
    const permission=await queryOne('SELECT * FROM marketing_permissions WHERE channel=$1 AND destination=$2',[recipient.channel,recipient.destination]);
    if(!permission?.allowed){await run("UPDATE marketing_recipients SET status='skipped',error='Marketing permission missing or withdrawn' WHERE id=$1",[recipient.id]);continue;}
    const url=`${base}/api/public/marketing/unsubscribe/${permission.unsubscribe_token}`;
    const html=recipient.message_format==='html'?marketingEmailHtml(fillEmailTemplate(recipient.message,{FIRST_NAME:recipient.name.trim().split(/\s+/)[0]||'there'}),url):`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202020"><h2>Fleming Lettings</h2><p>Hi ${esc(recipient.name)},</p><div style="white-space:pre-wrap">${esc(recipient.message)}</div><p><a href="${url}">Unsubscribe from marketing emails</a></p><p>Fleming Lettings · 01902 212 415</p></body></html>`;
    const sms=`Fleming Lettings: ${recipient.message}\nOpt out: ${url}`;
    const files=recipient.channel==='email'?await campaignAttachments(recipient.attachment_ids||[]):[];
    const attachments=files.map(f=>({filename:f.original_name,content:fs.readFileSync(path.join(marketingRoot(),f.filename)),contentType:f.mime_type}));
    const result=recipient.channel==='email'?await sendEmail({to:recipient.destination,subject:recipient.subject,html,fromEmail:recipient.from_email||OUTBOUND_EMAIL_ADDRESS,attachments,idempotencyKey:`marketing-${recipient.campaign_id}-${recipient.id}`}):await sendSms({to:recipient.destination,body:sms});
    const providerId=(result as any).id||(result as any).sid||null;
    const status=result.simulated?'simulated':result.success?'sent':'failed';
    const links=await query('SELECT entity_type,entity_id FROM marketing_recipient_links WHERE recipient_id=$1',[recipient.id]);
    for(const link of links.length?links:[recipient]) {
    if(recipient.channel==='email')await run(`INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,sent_by,sent_by_email,error_message) VALUES($1,$2,$3,$4,$5,$6,'marketing',$7,$8,$9,$10,$11)`,[providerId,link.entity_type,link.entity_id,recipient.destination,recipient.from_email||OUTBOUND_EMAIL_ADDRESS,recipient.subject,html,status,recipient.created_by,recipient.sender_email,result.error||null]);
    else await run(`INSERT INTO sms_messages(entity_type,entity_id,to_phone,message_body,status,twilio_sid,error_message,sent_by,sent_by_email) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[link.entity_type,link.entity_id,recipient.destination,sms,status,providerId,result.error||null,recipient.created_by,recipient.sender_email]);
    }
    await run('UPDATE marketing_recipients SET status=$1,error=$2,provider_id=$3,sent_at=NOW() WHERE id=$4',[status,result.error||null,providerId,recipient.id]);
   }catch{await run("UPDATE marketing_recipients SET status='unknown',error='Delivery could not be confirmed. Check provider history before retrying.' WHERE id=$1",[recipient.id]);}
  }
  await run(`UPDATE marketing_campaigns c SET status=CASE WHEN EXISTS(SELECT 1 FROM marketing_recipients r WHERE r.campaign_id=c.id AND r.status IN ('failed','unknown')) THEN 'completed_with_errors' ELSE 'completed' END WHERE status='sending' AND NOT EXISTS(SELECT 1 FROM marketing_recipients r WHERE r.campaign_id=c.id AND r.status IN ('pending','sending'))`);
 }finally{running=false;}
}
export function registerMarketing(app:Express){
 registerMarketingFiles(app);
 const assetRoot=path.join(process.env.UPLOADS_PATH||path.join(__dirname,'../uploads'),'email-images');
 const imageUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1}}).single('file');
 app.get('/api/message-templates',authMiddleware,requirePermission('staff'),(_req,res)=>res.json(emailTemplateLibrary()));
 app.post('/api/marketing/images',authMiddleware,requirePermission('manager'),(req:AuthRequest,res,next)=>imageUpload(req,res,error=>error?res.status(400).json({error:'Choose one image up to 8 MB'}):next()),async(req:AuthRequest,res)=>{
  if(!req.file)return res.status(400).json({error:'Choose an image'});
  try{const data=await sharp(req.file.buffer,{limitInputPixels:25000000}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
   const filename=crypto.createHash('sha256').update(data).digest('hex')+'.webp';fs.mkdirSync(assetRoot,{recursive:true});if(!fs.existsSync(path.join(assetRoot,filename)))fs.writeFileSync(path.join(assetRoot,filename),data,{mode:0o600});
   await run("INSERT INTO marketing_files(kind,filename,original_name,mime_type,size,created_by) VALUES('image',$1,$2,'image/webp',$3,$4) ON CONFLICT(kind,filename,original_name) DO NOTHING",[filename,req.file.originalname,data.length,req.user.id]);
   await audit(req,'email_image_uploaded',null,{filename,original_name:req.file.originalname});res.json({name:req.file.originalname,url:`${base}/api/public/email-images/${filename}`});
  }catch{res.status(400).json({error:'Choose a valid PNG, JPEG, WebP or GIF image up to 8 MB'});}
 });
 app.get('/api/public/email-images/:filename',(req,res)=>{const name=String(req.params.filename);if(!/^[a-f0-9]{64}\.webp$/.test(name)||!fs.existsSync(path.join(assetRoot,name)))return res.sendStatus(404);res.type('webp').setHeader('Cross-Origin-Resource-Policy','cross-origin');res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.sendFile(path.resolve(assetRoot,name));});

 app.get('/api/marketing/contacts',authMiddleware,requirePermission('manager'),async(req,res)=>{const rows=await marketingContacts(),permissions=await query('SELECT channel,destination,allowed,evidence FROM marketing_permissions');res.json(rows.map(row=>({...row,email_allowed:permissions.some(p=>p.channel==='email'&&p.destination===marketingDestination('email',row.email||'')&&p.allowed),sms_allowed:permissions.some(p=>p.channel==='sms'&&p.destination===marketingDestination('sms',row.phone||'')&&p.allowed)})));});
 app.put('/api/marketing/permission',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{
  const {channel,allowed,evidence}=req.body;if(!['email','sms'].includes(channel)||typeof allowed!=='boolean')return res.status(400).json({error:'Choose Email or SMS and Opt In or Opt Out'});
  const destination=marketingDestination(channel,String(req.body.destination||''));if(!destination||(channel==='email'?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination):!/^\+\d{10,15}$/.test(destination)))return res.status(400).json({error:'Enter a valid contact address'});
  await run(`INSERT INTO marketing_permissions(channel,destination,allowed,evidence,updated_by,unsubscribe_token) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(channel,destination) DO UPDATE SET allowed=$3,evidence=$4,updated_by=$5,updated_at=NOW()`,[channel,destination,allowed,String(evidence||`Office ${allowed?'opted in':'opted out'} through the marketing permission controls`).slice(0,4000),req.user.id,crypto.randomUUID()]);await audit(req,'marketing_permission',null,{channel,destination,allowed,evidence});res.json({success:true});
 });
 app.get('/api/marketing/export',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{const rows=await marketingContacts();const filtered=req.query.audience?rows.filter(r=>r.audience===req.query.audience):rows;await audit(req,'export',null,{count:filtered.length,audience:req.query.audience||'All'});res.setHeader('Content-Disposition','attachment; filename="fleming-marketing-contacts.csv"');res.type('text/csv').send('\uFEFF'+[['Audience','Name','Email','Phone','Record type','Record ID'],...filtered.map(r=>[r.audience,r.name,r.email,r.phone,r.entity_type,r.id])].map(r=>r.map(csvCell).join(',')).join('\r\n'));});
 app.get('/api/marketing/campaigns',authMiddleware,requirePermission('manager'),async(req,res)=>res.json(await query(`
   SELECT c.*,u.name AS sender_name,u.email AS sender_email,stats.counts,stats.total_count,stats.delivered_count,stats.failed_count,stats.bounced_count,stats.opened_count,
     CASE WHEN stats.total_count>0 THEN ROUND(100.0*stats.bounced_count/stats.total_count) ELSE NULL END AS bounce_rate,
     CASE WHEN stats.delivered_count>0 THEN ROUND(100.0*stats.opened_count/stats.delivered_count) ELSE NULL END AS open_rate,
     CASE WHEN stats.total_count>0 THEN ROUND(100.0*stats.delivered_count/stats.total_count) ELSE NULL END AS success_rate
   FROM marketing_campaigns c LEFT JOIN users u ON u.id=c.created_by
   CROSS JOIN LATERAL (
     SELECT COALESCE(json_agg(json_build_object('status',grouped.status,'count',grouped.n)),'[]') AS counts,
       COALESCE(sum(grouped.n),0)::int AS total_count,
       COALESCE(sum(grouped.n) FILTER(WHERE grouped.status IN ('delivered','opened','clicked')),0)::int AS delivered_count,
       COALESCE(sum(grouped.n) FILTER(WHERE grouped.status IN ('failed','bounced','complained','undelivered')),0)::int AS failed_count,
       COALESCE(sum(grouped.n) FILTER(WHERE grouped.status='bounced'),0)::int AS bounced_count,
       COALESCE(sum(grouped.opened),0)::int AS opened_count
     FROM (SELECT effective.status,count(*)::int n,count(*) FILTER(WHERE effective.opened)::int opened FROM (
       SELECT COALESCE(CASE WHEN c.channel='email' THEN (SELECT em.status FROM email_messages em WHERE em.resend_id=r.provider_id ORDER BY em.id DESC LIMIT 1)
         ELSE (SELECT sm.status FROM sms_messages sm WHERE sm.twilio_sid=r.provider_id ORDER BY sm.id DESC LIMIT 1) END,r.status) AS status,
       c.channel='email' AND EXISTS(SELECT 1 FROM email_messages em WHERE em.resend_id=r.provider_id AND (em.opened_at IS NOT NULL OR em.clicked_at IS NOT NULL OR em.status IN ('opened','clicked'))) AS opened
       FROM marketing_recipients r WHERE r.campaign_id=c.id
     ) effective GROUP BY effective.status) grouped
   ) stats ORDER BY c.created_at DESC LIMIT 100`)));
 app.post('/api/marketing/campaigns',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{
  const {channel,subject,message,recipients}=req.body;const format=channel==='email'&&req.body.message_format==='html'?'html':'text';if(!['email','sms'].includes(channel)||typeof message!=='string'||!message.trim()||message.length>(channel==='sms'?1000:200000)||(channel==='email'&&(!subject||String(subject).length>200))||!Array.isArray(recipients)||!recipients.length||recipients.length>1000)return res.status(400).json({error:'Choose recipients and enter a message (SMS up to 1,000 characters; email up to 200,000)'});
  if(format==='html'&&(message.match(/\{\{[A-Z_]+\}\}/g)||[]).some(key=>key!=='{{FIRST_NAME}}'))return res.status(400).json({error:'Fill in the template details before sending'});
  const fromEmail=String(req.body.from_email||OUTBOUND_EMAIL_ADDRESS).trim().toLowerCase();
  if(channel==='email'&&!allowedMarketingSender(fromEmail))return res.status(400).json({error:'Use a Fleming Lettings sender email address'});
  const attachmentIds=channel==='email'?(req.body.attachment_ids||[]):[];
  try{await campaignAttachments(attachmentIds);}catch(e){return res.status(400).json({error:(e as Error).message});}
  const contacts=await marketingContacts();const chosen=contacts.filter(c=>recipients.includes(`${c.entity_type}:${c.id}`));const unique=new Map<string,any>();
  for(const c of chosen){const dest=marketingDestination(channel,String(channel==='email'?c.email||'':c.phone||''));if(dest)unique.set(dest,c);}
  if(!unique.size)return res.status(400).json({error:'The selected contacts have no valid destinations'});
  const c=await pool.connect();const id=crypto.randomUUID();try{await c.query('BEGIN');
   for(const dest of unique.keys()){const permitted=(await c.query('SELECT allowed FROM marketing_permissions WHERE channel=$1 AND destination=$2',[channel,dest])).rows[0];if(!permitted?.allowed){await c.query('ROLLBACK');return res.status(409).json({error:'Record marketing permission for each recipient before creating this campaign'});}}
   await c.query('INSERT INTO marketing_campaigns(id,name,channel,subject,message,created_by,message_format,from_email,attachment_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,String(req.body.name||subject||'SMS Campaign').slice(0,200),channel,subject||null,format==='html'?cleanMarketingHtml(templateAssets(message.trim())):message.trim(),req.user.id,format,channel==='email'?fromEmail:null,JSON.stringify(attachmentIds)]);
   for(const [dest,r] of unique){const inserted=(await c.query('INSERT INTO marketing_recipients(campaign_id,entity_type,entity_id,name,destination) VALUES($1,$2,$3,$4,$5) RETURNING id',[id,r.entity_type,r.id,r.name,dest])).rows[0];for(const linked of chosen.filter(contact=>marketingDestination(channel,String(channel==='email'?contact.email||'':contact.phone||''))===dest))await c.query('INSERT INTO marketing_recipient_links(recipient_id,entity_type,entity_id) VALUES($1,$2,$3)',[inserted.id,linked.entity_type,linked.id]);}
   await c.query('COMMIT');await audit(req,'campaign_created',null,{campaign_id:id,channel,recipients:unique.size});res.status(201).json({id,count:unique.size});
  }catch{await c.query('ROLLBACK');res.status(500).json({error:'Campaign could not be saved'});}finally{c.release();}
 });
 app.get('/api/marketing/campaigns/:id',authMiddleware,requirePermission('manager'),async(req,res)=>{const campaign=await queryOne('SELECT * FROM marketing_campaigns WHERE id=$1',[req.params.id]);if(!campaign)return res.sendStatus(404);const sentEmail=campaign.channel==='email'?await queryOne('SELECT body_html,to_email FROM email_messages WHERE resend_id IN(SELECT provider_id FROM marketing_recipients WHERE campaign_id=$1) AND body_html IS NOT NULL ORDER BY id LIMIT 1',[campaign.id]):null;res.json({...campaign,email_preview:sentEmail?.body_html||null,email_preview_recipient:sentEmail?.to_email||null,attachments:await campaignAttachments(campaign.attachment_ids||[]).then(files=>files.map(f=>({id:f.id,name:f.original_name,size:f.size}))),recipients:await query(`SELECT r.*,COALESCE(CASE WHEN $2='email' THEN (SELECT em.status FROM email_messages em WHERE em.resend_id=r.provider_id ORDER BY em.id DESC LIMIT 1) ELSE (SELECT sm.status FROM sms_messages sm WHERE sm.twilio_sid=r.provider_id ORDER BY sm.id DESC LIMIT 1) END,r.status) AS status,COALESCE(CASE WHEN $2='email' THEN (SELECT em.error_message FROM email_messages em WHERE em.resend_id=r.provider_id ORDER BY em.id DESC LIMIT 1) ELSE (SELECT sm.error_message FROM sms_messages sm WHERE sm.twilio_sid=r.provider_id ORDER BY sm.id DESC LIMIT 1) END,r.error) AS error,p.allowed AS marketing_allowed,p.updated_at AS permission_updated_at FROM marketing_recipients r LEFT JOIN marketing_permissions p ON p.channel=$2 AND p.destination=r.destination WHERE campaign_id=$1 ORDER BY r.id`,[campaign.id,campaign.channel])});});
 app.post('/api/marketing/campaigns/:id/send',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{const row=await queryOne("UPDATE marketing_campaigns SET status='sending',started_at=NOW() WHERE id=$1 AND status='draft' RETURNING id",[req.params.id]);if(!row)return res.status(409).json({error:'This campaign has already been queued or sent'});await audit(req,'campaign_started',null,{campaign_id:row.id});res.status(202).json({success:true});void processMarketing().catch(()=>console.error('Marketing worker failed'));});
 app.get('/api/public/marketing/unsubscribe/:token',async(req,res)=>{if(!/^[a-f0-9-]{36}$/i.test(String(req.params.token)))return res.sendStatus(404);const p=await queryOne('SELECT channel,allowed FROM marketing_permissions WHERE unsubscribe_token=$1',[req.params.token]);if(!p)return res.sendStatus(404);res.type('html').send(`<!doctype html><html><body style="font-family:Arial;padding:40px"><h1>Fleming Lettings</h1><h2>Marketing Preferences</h2><p>Marketing ${p.channel==='email'?'emails':'texts'} are currently ${p.allowed?'enabled':'disabled'}.</p><form method="post"><button type="submit" name="preference" value="out">Confirm unsubscribe</button> <button type="submit" name="preference" value="in">Opt in to marketing</button></form></body></html>`);});
 app.post('/api/public/marketing/unsubscribe/:token',async(req,res)=>{if(!/^[a-f0-9-]{36}$/i.test(String(req.params.token)))return res.sendStatus(404);const allowed=req.body?.preference==='in';const p=await queryOne('UPDATE marketing_permissions SET allowed=$1,evidence=$2,updated_at=NOW(),updated_by=NULL WHERE unsubscribe_token=$3 RETURNING channel,destination',[allowed,allowed?'Recipient opted in through their preferences link':'Recipient unsubscribed',req.params.token]);if(!p)return res.sendStatus(404);await run("INSERT INTO audit_log(action,entity_type,changes) VALUES($1,'marketing',$2)",[allowed?'marketing_opt_in':'marketing_unsubscribe',JSON.stringify({...p,allowed})]);res.type('html').send(allowed?'<h1>You are opted in</h1><p>Fleming Lettings may send marketing through this channel. You can change this choice using the same preferences link.</p>':'<h1>You are unsubscribed</h1><p>Fleming Lettings will no longer send marketing through this channel.</p>');});
 if(process.env.NODE_ENV==='production'){void run("UPDATE marketing_recipients SET status='unknown',error='Delivery interrupted. Check provider history before retrying.' WHERE status='sending'").then(()=>processMarketing()).catch(()=>console.error('Marketing recovery failed'));const timer=setInterval(()=>void processMarketing().catch(()=>console.error('Marketing worker failed')),15000);timer.unref();}
}
