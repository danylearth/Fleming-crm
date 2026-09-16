import type {Express} from 'express';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {authMiddleware,requirePermission,hasPermission,type AuthRequest} from './auth';
import {query,queryOne,run} from './db-pg';
import {sendEmail,brandedEmailHtml,OUTBOUND_EMAIL_ADDRESS} from './email';
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function wantsEmailAction(message:string){
 if(/\b(?:do not|don't|never|without|no need to)\s+(?:send|email)\b/i.test(message))return false;
 return /\b(?:send|email)\s+(?:me|us|the|a|this|these|that|those|all|it|them|report|reports|document|documents|file|files|certificate|certificates|inventory|agreement|summary|to)\b/i.test(message)||/\bemail\s+[^\s]+@[^\s]+/i.test(message);
}
export function requestedRecipient(message:string,ownEmail:string){return message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||ownEmail;}
export async function flemoActions(user:{id:number;email:string;role:string},message:string,text:string,evidence:{documents:{id:number;name:string}[];records:any[]}){
 const actions:any[]=evidence.records.slice(0,8).map(r=>({id:`${r.entity}-${r.id}`,type:'link',label:r.name,href:`/${r.entity}/${r.id}`}));
 for(const doc of evidence.documents.slice(0,10))actions.push({id:`document-${doc.id}`,type:'download',label:`Download ${doc.name}`,href:`/api/documents/download/${doc.id}`,payload:{filename:doc.name}});
 if(/report|summary|export/i.test(message))actions.push({id:'download-report',type:'report',label:'Download Report',payload:{content:text,filename:'Fleming CRM Report.txt'}});
 if(wantsEmailAction(message)){
  if(!hasPermission(user.role,'staff'))return {actions,note:'Your account can read and download records. Sending requires staff access; contact accounts@fleminglettings.co.uk.'};
  const documents=/\b(document|documents|file|files|certificate|certificates|inventory|agreement)\b/i.test(message)?evidence.documents.slice(0,10):[];
  if(/\b(document|documents|file|files|certificate|certificates|inventory|agreement)\b/i.test(message)&&!documents.length)return {actions,note:'No matching document was found. Specify the tenant’s full name or property address.'};
  const id=randomUUID(),to=requestedRecipient(message,user.email),subject=documents.length?'Requested Fleming CRM documents':'Fleming CRM report';
  await run('INSERT INTO ai_action_requests(id,user_id,payload) VALUES($1,$2,$3)',[id,user.id,JSON.stringify({to,subject,text,document_ids:documents.map(d=>d.id)})]);
  actions.push({id,type:'confirm',label:`Send ${documents.length?documents.length+' Document(s)':'Report'} to ${to}`,payload:{request_id:id}});
  return {actions,note:`Ready for review. Nothing has been sent. The Send button will email ${to}${documents.length?' with the listed documents':''}.`};
 }
 return {actions,note:''};
}
export function registerFlemoActions(app:Express){
 app.post('/api/ai/execute',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const id=req.body?.payload?.request_id;
  if(typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id))return res.status(400).json({error:'Choose an action from your current Flemo conversation'});
  const proposal=await queryOne('SELECT payload FROM ai_action_requests WHERE id=$1 AND user_id=$2 AND expires_at>NOW() AND claimed_at IS NULL',[id,req.user.id]);
  if(!proposal)return res.status(409).json({error:'This action expired or has already been used. Ask Flemo again.'});
  const p=proposal.payload;const root=path.resolve(process.env.UPLOADS_PATH||path.join(__dirname,'../uploads'));
  const docs=p.document_ids.length?await query('SELECT * FROM documents WHERE id=ANY($1::int[])',[p.document_ids]):[];
  if(docs.length!==p.document_ids.length)return res.status(409).json({error:'A document has changed. Ask Flemo again.'});
  const attachments=[];let bytes=0;
  for(const doc of docs){const file=path.resolve(root,doc.filename);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.status(409).json({error:'A document is unavailable. Download and check the source record.'});const size=fs.statSync(file).size;bytes+=size;if(bytes>20*1024*1024)return res.status(400).json({error:'Attachments exceed 20 MB. Download the files and send them through your office file-sharing service.'});attachments.push({filename:doc.original_name,content:fs.readFileSync(file),contentType:doc.mime_type});}
  const claimed=await queryOne('UPDATE ai_action_requests SET claimed_at=NOW() WHERE id=$1 AND user_id=$2 AND claimed_at IS NULL AND expires_at>NOW() RETURNING id',[id,req.user.id]);
  if(!claimed)return res.status(409).json({error:'This action has already been used.'});
  const html=brandedEmailHtml(p.subject,`<p style="white-space:pre-wrap">${escape(p.text)}</p>`);
  const sent=await sendEmail({to:p.to,subject:p.subject,html,attachments,idempotencyKey:`flemo-${id}`});
  await run("INSERT INTO email_messages(resend_id,to_email,from_email,subject,template,body_html,status,sent_by,sent_by_email,error_message) VALUES($1,$2,$3,$4,'flemo_report',$5,$6,$7,$8,$9)",[sent.id||null,p.to,OUTBOUND_EMAIL_ADDRESS,p.subject,html,sent.simulated?'simulated':sent.success?'sent':'failed',req.user.id,req.user.email,sent.error||null]);
  await run("INSERT INTO audit_log(user_id,user_email,action,entity_type,changes) VALUES($1,$2,'send','flemo_action',$3)",[req.user.id,req.user.email,JSON.stringify({request_id:id,recipient:p.to,document_ids:p.document_ids,success:sent.success})]);
  if(!sent.success||sent.simulated)return res.status(502).json({error:sent.simulated?'Email was simulated; nothing was sent.':sent.error||'Email could not be sent. Check Communications before trying again.'});
  res.json({text:`Email accepted for delivery to ${p.to}${docs.length?` with ${docs.length} document(s)`:''}. Delivery status is available in Communications.`});
 });
}
