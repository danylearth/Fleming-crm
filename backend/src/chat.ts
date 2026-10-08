import type {Express,Request,Response,NextFunction} from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import {rateLimit} from 'express-rate-limit';
import pool,{query,queryOne,run} from './db-pg';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import {validateTwilioWebhook} from './sms';
import {findChatContact} from './chat-record-matching';
import {whatsappMediaError,whatsappMediaUrl,validWhatsAppMediaToken} from './chat-whatsapp-media';

type ChatUser={id:number;name:string;role:string;department?:string;email?:string};
export const chatFileTypes:Record<string,string>={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.csv':'text/csv','.txt':'text/plain'};
export function canReadChat(conversation:any,user:ChatUser,isMember:boolean){
 if(conversation.kind==='direct'||conversation.kind==='group')return isMember;
 if(conversation.kind==='department')return Boolean(user.department&&conversation.department===user.department)||['admin','manager'].includes(user.role);
 return ['staff','manager','admin'].includes(user.role);
}
const chatRoot=()=>path.join(path.dirname(process.env.UPLOADS_PATH||path.join(__dirname,'../uploads')),'private-chat');
const uuid=(v:any)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const tokenHash=(v:string)=>crypto.createHash('sha256').update(v).digest('hex');
const publicConversation=(c:any)=>({id:c.id,kind:c.kind,title:c.kind==='direct'?(c.direct_name||'Colleague'):c.title,department:c.department,direct_user_id:c.kind==='direct'?c.direct_user_id:null,status:c.status,assigned_to:c.assigned_to,entity_type:c.entity_type,entity_id:c.entity_id,visitor_name:c.visitor_name,visitor_email:c.visitor_email,visitor_phone:c.visitor_phone,updated_at:c.updated_at,last_customer_message_at:c.last_customer_message_at,unread:Number(c.unread||0),last_message:c.last_message});
const access=async(id:string,user:ChatUser)=>{
 if(!uuid(id))return null;const c=await queryOne('SELECT c.*,COALESCE((SELECT cm.cleared_through_id FROM chat_members cm WHERE cm.conversation_id=c.id AND cm.user_id=$2),0) AS cleared_through_id,(SELECT u.name FROM chat_members dm JOIN users u ON u.id=dm.user_id WHERE dm.conversation_id=c.id AND dm.user_id<>$2 ORDER BY u.id LIMIT 1) AS direct_name,(SELECT dm.user_id FROM chat_members dm WHERE dm.conversation_id=c.id AND dm.user_id<>$2 ORDER BY dm.user_id LIMIT 1) AS direct_user_id,EXISTS(SELECT 1 FROM chat_members m WHERE m.conversation_id=c.id AND m.user_id=$2) AS member FROM chat_conversations c WHERE c.id=$1',[id,user.id]);return c&&canReadChat(c,user,c.member)?c:null;
};
async function messages(id:string,after=0){return query(`SELECT m.id,m.sender_id,m.sender_name,m.body,m.status,m.created_at,COALESCE((SELECT json_agg(json_build_object('id',f.id,'name',f.original_name,'size',f.size)) FROM chat_files f WHERE f.message_id=m.id),'[]') AS files FROM chat_messages m WHERE m.conversation_id=$1 AND m.id>$2 ORDER BY m.id`,[id,after]);}
async function auditChat(c:any,user:ChatUser,action:string){if(c.entity_type&&c.entity_id)await run('INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',[user.id,user.email,action,c.entity_type,c.entity_id,JSON.stringify({conversation_id:c.id,channel:c.kind,title:c.title,assigned_to:c.assigned_to})]);}
async function saveMessage(c:any,user:ChatUser|null,body:string,clientId:string,fileIds:string[]=[],providerId:string|null=null){
 const db=await pool.connect();try{await db.query('BEGIN');
  const locked=(await db.query('SELECT status FROM chat_conversations WHERE id=$1 FOR UPDATE',[c.id])).rows[0];if(locked.status==='closed')throw Error('This conversation is closed. Reopen it before replying.');
  const existing=(await db.query('SELECT id,sender_id FROM chat_messages WHERE conversation_id=$1 AND client_id=$2',[c.id,clientId])).rows[0];if(existing){if(existing.sender_id!==(user?.id||null))throw Error('Message reference already used.');await db.query('COMMIT');return existing;}
  if(fileIds.length){const valid=await db.query('SELECT id FROM chat_files WHERE id=ANY($1::uuid[]) AND conversation_id=$2 AND uploaded_by=$3 AND message_id IS NULL FOR UPDATE',[fileIds,c.id,user?.id]);if(valid.rowCount!==fileIds.length)throw Error('Choose files uploaded to this conversation.');}
  const row=(await db.query('INSERT INTO chat_messages(conversation_id,sender_id,sender_name,body,client_id,provider_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[c.id,user?.id||null,user?.name||c.visitor_name||'Visitor',body,clientId,providerId])).rows[0];
  if(fileIds.length)await db.query('UPDATE chat_files SET message_id=$1 WHERE id=ANY($2::uuid[])',[row.id,fileIds]);
  await db.query('UPDATE chat_conversations SET updated_at=NOW(),last_customer_message_at=CASE WHEN $2 THEN NOW() ELSE last_customer_message_at END WHERE id=$1',[c.id,!user]);await db.query('COMMIT');return row;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export function validChatMessage(body:any){return typeof body.body==='string'&&body.body.trim().length<=8000&&uuid(body.client_id)&&(!body.file_ids||(Array.isArray(body.file_ids)&&body.file_ids.length<=5&&new Set(body.file_ids).size===body.file_ids.length&&body.file_ids.every(uuid)))&&(body.body.trim().length>0||body.file_ids?.length>0);}
export function validChatFile(ext:string,data:Buffer){return Boolean(chatFileTypes[ext])&&data.length>0&&(!(ext==='.pdf')||data.subarray(0,5).toString()==='%PDF-')&&(!['.docx','.xlsx'].includes(ext)||data.subarray(0,2).toString()==='PK')&&(!['.png','.jpg','.jpeg','.webp'].includes(ext)||ext==='.png'&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||['.jpg','.jpeg'].includes(ext)&&data[0]===255&&data[1]===216||ext==='.webp'&&data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP');}
let whatsappCache:{at:number;value:any}|null=null;
export async function whatsappStatus(){
 if(whatsappCache&&Date.now()-whatsappCache.at<60000)return whatsappCache.value;
 const number=process.env.TWILIO_PHONE_NUMBER||'';let ready=false;
 if(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN){const r=await fetch('https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp',{headers:{Authorization:'Basic '+Buffer.from(process.env.TWILIO_ACCOUNT_SID+':'+process.env.TWILIO_AUTH_TOKEN).toString('base64')},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('WhatsApp connection could not be checked.');const d:any=await r.json();ready=(d.senders||[]).some((s:any)=>(s.sender_id||s.senderId)==='whatsapp:'+number&&s.status==='ONLINE');}
 const value={number,ready,message:ready?'Connected':'This number needs WhatsApp approval in Twilio/Meta.'};whatsappCache={at:Date.now(),value};return value;
}
export function registerChat(app:Express){
 const staff=[authMiddleware,requirePermission('staff')];
 const sendLimit=rateLimit({windowMs:60000,limit:60,standardHeaders:true,legacyHeaders:false});
 app.get('/api/chat/directory',authMiddleware,async(req:AuthRequest,res)=>res.json({users:await query("SELECT u.id,u.name,u.department,u.avatar_url,EXISTS(SELECT 1 FROM chat_presence p WHERE p.user_id=u.id AND p.last_seen>NOW()-INTERVAL '75 seconds') AS online FROM users u WHERE u.is_active=1 ORDER BY u.name"),department:req.user.department||null,departments:await query("SELECT name,office_address FROM departments WHERE name=$1 OR $2=TRUE ORDER BY name",[req.user.department||'', ['admin','manager'].includes(req.user.role)])}));
 app.post('/api/chat/presence',authMiddleware,async(req:AuthRequest,res)=>{await run('INSERT INTO chat_presence(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET last_seen=NOW()',[req.user.id]);res.json({success:true});});
 app.get('/api/chat/whatsapp-status',...staff,async(_req,res)=>res.json(await whatsappStatus()));
 app.get('/api/chat/conversations',authMiddleware,async(req:AuthRequest,res)=>{
  const rows=await query(`SELECT c.*, (SELECT u.name FROM chat_members dm JOIN users u ON u.id=dm.user_id WHERE dm.conversation_id=c.id AND dm.user_id<>$1 ORDER BY u.id LIMIT 1) AS direct_name,(SELECT dm.user_id FROM chat_members dm WHERE dm.conversation_id=c.id AND dm.user_id<>$1 ORDER BY dm.user_id LIMIT 1) AS direct_user_id, (SELECT count(*) FROM chat_messages msg WHERE msg.conversation_id=c.id AND msg.sender_id IS DISTINCT FROM $1 AND msg.id>COALESCE((SELECT last_read_id FROM chat_members WHERE conversation_id=c.id AND user_id=$1),0)) AS unread,(SELECT body FROM chat_messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_message FROM chat_conversations c WHERE ((c.kind IN ('direct','group') AND EXISTS(SELECT 1 FROM chat_members WHERE conversation_id=c.id AND user_id=$1)) OR (c.kind='department' AND ((c.department=$2 AND $2<>'') OR $4=TRUE)) OR (c.kind IN ('live','whatsapp') AND $3=TRUE)) AND NOT EXISTS(SELECT 1 FROM chat_members hidden WHERE hidden.conversation_id=c.id AND hidden.user_id=$1 AND hidden.hidden_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM chat_messages newer WHERE newer.conversation_id=c.id AND newer.id>hidden.cleared_through_id)) ORDER BY c.updated_at DESC`,[req.user.id,req.user.department||'',req.user.role!=='viewer',['admin','manager'].includes(req.user.role)]);res.json(rows.map(publicConversation));
 });
 app.post('/api/chat/conversations',authMiddleware,async(req:AuthRequest,res)=>{
  const kind=req.body.kind;if(!['direct','group','department'].includes(kind))return res.status(400).json({error:'Choose a colleague or your department.'});
  const id=crypto.randomUUID();let c;
  if(kind==='direct'){const other=await queryOne('SELECT id,name FROM users WHERE id=$1 AND is_active=1',[Number(req.body.user_id)||0]);if(!other||other.id===req.user.id)return res.status(400).json({error:'Choose another active colleague.'});const key=[req.user.id,other.id].sort((a,b)=>a-b).join(':');const db=await pool.connect();try{await db.query('BEGIN');c=(await db.query("INSERT INTO chat_conversations(id,kind,title,direct_key) VALUES($1,'direct',$2,$3) ON CONFLICT(direct_key) DO UPDATE SET direct_key=EXCLUDED.direct_key RETURNING *",[id,[req.user.name,other.name].join(' & '),key])).rows[0];for(const userId of [req.user.id,other.id])await db.query('INSERT INTO chat_members(conversation_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[c.id,userId]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
  else if(kind==='group'){
   const title=String(req.body.title||'').trim(),ids=Array.isArray(req.body.user_ids)?[...new Set<number>(req.body.user_ids.map(Number).filter((v:number)=>Number.isInteger(v)&&v>0))]:[];
   if(!title||title.length>100||ids.length<1||ids.length>49)return res.status(400).json({error:'Enter a group name and choose up to 49 colleagues.'});
   const members=[...new Set([req.user.id,...ids])];if(members.length<2)return res.status(400).json({error:'Choose at least one other colleague.'});
   const active=await query('SELECT id FROM users WHERE id=ANY($1::int[]) AND is_active=1',[members]);if(active.length!==members.length)return res.status(400).json({error:'Choose active colleagues only.'});
   const db=await pool.connect();try{await db.query('BEGIN');c=(await db.query("INSERT INTO chat_conversations(id,kind,title,created_by) VALUES($1,'group',$2,$3) RETURNING *",[id,title,req.user.id])).rows[0];await db.query('INSERT INTO chat_members(conversation_id,user_id) SELECT $1,unnest($2::int[])',[id,members]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  else {const department=String(req.body.department||req.user.department||'');if(!department||(!['admin','manager'].includes(req.user.role)&&department!==req.user.department)||!await queryOne('SELECT id FROM departments WHERE name=$1',[department]))return res.status(403).json({error:'Choose an office or department available to your account.'});c=await queryOne("INSERT INTO chat_conversations(id,kind,title,department) VALUES($1,'department',$2,$2) ON CONFLICT(department) WHERE kind='department' DO UPDATE SET title=EXCLUDED.title RETURNING *",[id,department]);}
  await run('UPDATE chat_members SET hidden_at=NULL WHERE conversation_id=$1 AND user_id=$2',[c.id,req.user.id]);
  res.json(publicConversation(await access(c.id,req.user)));
 });
 app.get('/api/chat/conversations/:id/messages',authMiddleware,async(req:AuthRequest,res)=>{const c=await access(String(req.params.id),req.user);if(!c)return res.sendStatus(404);res.json({conversation:publicConversation(c),messages:await messages(c.id,Number(c.cleared_through_id||0))});});
 app.delete('/api/chat/conversations/:id',authMiddleware,async(req:AuthRequest,res)=>{
  const c=await access(String(req.params.id),req.user);if(!c)return res.sendStatus(404);
  await run('INSERT INTO chat_members(conversation_id,user_id,last_read_id,cleared_through_id,hidden_at) SELECT $1,$2,COALESCE(MAX(id),0),COALESCE(MAX(id),0),NOW() FROM chat_messages WHERE conversation_id=$1 ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_id=EXCLUDED.last_read_id,cleared_through_id=EXCLUDED.cleared_through_id,hidden_at=NOW()',[c.id,req.user.id]);res.json({success:true});
 });
 app.post('/api/chat/conversations/:id/read',authMiddleware,async(req:AuthRequest,res)=>{const c=await access(String(req.params.id),req.user);if(!c)return res.sendStatus(404);await run('INSERT INTO chat_members(conversation_id,user_id,last_read_id) SELECT $1,$2,COALESCE(MAX(id),0) FROM chat_messages WHERE conversation_id=$1 ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_id=EXCLUDED.last_read_id',[c.id,req.user.id]);res.json({success:true});});
 app.post('/api/chat/conversations/:id/messages',authMiddleware,sendLimit,async(req:AuthRequest,res)=>{
  const c=await access(String(req.params.id),req.user);if(!c)return res.sendStatus(404);if(!validChatMessage(req.body))return res.status(400).json({error:'Enter a message up to 8,000 characters or attach up to five files.'});
  let providerId:string|null=null;
  if(c.kind==='whatsapp'){
   if(req.body.file_ids?.length>1)return res.status(400).json({error:'Send one WhatsApp attachment at a time.'});
   if(c.status==='closed')return res.status(409).json({error:'Reopen the conversation before replying.'});
   if(!c.last_customer_message_at||Date.now()-new Date(c.last_customer_message_at).getTime()>86400000)return res.status(409).json({error:'The WhatsApp reply window has ended. An approved WhatsApp template is required.'});
   if(!(await whatsappStatus()).ready)return res.status(409).json({error:'The outbound number is awaiting WhatsApp approval.'});
   const db=await pool.connect();let claimed:any,attachment:any;
   try{await db.query('BEGIN');
    const locked=(await db.query('SELECT status FROM chat_conversations WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
    if(locked?.status!=='open')throw Error('Reopen the conversation before replying.');
    if(req.body.file_ids?.length){
     attachment=(await db.query('SELECT * FROM chat_files WHERE id=$1 AND conversation_id=$2 AND uploaded_by=$3 AND message_id IS NULL FOR UPDATE',[req.body.file_ids[0],c.id,req.user.id])).rows[0];
     const error=whatsappMediaError(attachment);if(error)throw Error(error);
     if(!attachment.mime_type.startsWith('image/')&&req.body.body.trim())throw Error('Send the document and your text as separate messages.');
    }
    claimed=(await db.query("INSERT INTO chat_messages(conversation_id,sender_id,sender_name,body,client_id,status) VALUES($1,$2,$3,$4,$5,'sending') ON CONFLICT(conversation_id,client_id) DO NOTHING RETURNING id",[c.id,req.user.id,req.user.name,req.body.body.trim(),req.body.client_id])).rows[0];
    if(!claimed)throw Error('This message was already submitted. Check its status before sending again.');
    if(attachment)await db.query('UPDATE chat_files SET message_id=$1 WHERE id=$2',[claimed.id,attachment.id]);
    await db.query('COMMIT');
   }catch(e:any){await db.query('ROLLBACK');return res.status(409).json({error:e.message});}finally{db.release();}
   try{const client=require('twilio')(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN);const base=process.env.BASE_URL||'https://fleming-crm-api.fly.dev';
    const sent=await client.messages.create({from:'whatsapp:'+process.env.TWILIO_PHONE_NUMBER,to:'whatsapp:'+c.visitor_phone,...(req.body.body.trim()?{body:req.body.body.trim()}:{}),...(attachment?{mediaUrl:[whatsappMediaUrl(attachment.id,base,process.env.JWT_SECRET||'')]}:{}),statusCallback:base+'/api/public/chat/whatsapp/status'});
    await run("UPDATE chat_messages SET provider_id=$2,status='sent' WHERE id=$1",[claimed.id,sent.sid]);await run('UPDATE chat_conversations SET updated_at=NOW() WHERE id=$1',[c.id]);return res.json({...claimed,status:'sent'});
   }catch(e){await run("UPDATE chat_messages SET status='failed' WHERE id=$1",[claimed.id]);return res.status(502).json({error:'WhatsApp delivery was not confirmed. Check the message status in Twilio before retrying.'});}
  }
  try{res.json(await saveMessage(c,req.user,req.body.body.trim(),req.body.client_id,req.body.file_ids||[],providerId));}catch(e:any){res.status(409).json({error:e.message});}
 });
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:1}}).single('file');
 app.post('/api/chat/conversations/:id/files',authMiddleware,async(req:AuthRequest,res,next)=>{const c=await access(String(req.params.id),req.user);if(!c||c.status!=='open')return res.sendStatus(404);(req as any).chatKind=c.kind;next();},(req,res,next)=>upload(req,res,e=>e?res.status(400).json({error:'Choose one file up to 15 MB.'}):next()),async(req:AuthRequest,res)=>{
  const f=req.file,ext=path.extname(f?.originalname||'').toLowerCase();if(!f||!validChatFile(ext,f.buffer))return res.status(400).json({error:'Choose a valid PDF, Office document, image, CSV or text file.'});
  if((req as any).chatKind==='whatsapp'){const error=whatsappMediaError({mime_type:chatFileTypes[ext],size:f.size});if(error)return res.status(400).json({error});}
  const id=crypto.randomUUID(),filename=id+ext,name=path.basename(f.originalname).replace(/[\r\n\x00-\x1f]/g,'').slice(0,180);fs.mkdirSync(chatRoot(),{recursive:true});fs.writeFileSync(path.join(chatRoot(),filename),f.buffer,{mode:0o600});
  try{await run('INSERT INTO chat_files(id,conversation_id,uploaded_by,filename,original_name,mime_type,size) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,req.params.id,req.user.id,filename,name,chatFileTypes[ext],f.size]);res.json({id,name,size:f.size});}catch(e){fs.unlinkSync(path.join(chatRoot(),filename));throw e;}
 });
 app.get('/api/chat/files/:id',authMiddleware,async(req:AuthRequest,res)=>{if(!uuid(req.params.id))return res.sendStatus(404);const f=await queryOne('SELECT * FROM chat_files WHERE id=$1',[req.params.id]);if(!f||!await access(f.conversation_id,req.user)||(!f.message_id&&f.uploaded_by!==req.user.id))return res.sendStatus(404);res.setHeader('X-Content-Type-Options','nosniff');res.download(path.join(chatRoot(),f.filename),f.original_name);});
 app.put('/api/chat/conversations/:id',...staff,async(req:AuthRequest,res)=>{
  const c=await access(String(req.params.id),req.user);if(!c||!['live','whatsapp'].includes(c.kind))return res.sendStatus(404);
  const {assigned_to,status,entity_type,entity_id}=req.body;
  if(assigned_to!==undefined&&assigned_to!==null&&!await queryOne("SELECT id FROM users WHERE id=$1 AND is_active=1 AND role IN ('staff','manager','admin')",[Number(assigned_to)||0]))return res.status(400).json({error:'Choose an active support colleague.'});
  if(status!==undefined&&!['open','closed'].includes(status))return res.status(400).json({error:'Choose Open or Closed.'});
  const tables:Record<string,string>={tenant:'tenants',landlord:'landlords',tenant_enquiry:'tenant_enquiries',landlord_bdm:'landlords_bdm',user:'users'};
  if(entity_type!==undefined&&(!tables[entity_type]||!Number.isInteger(entity_id)||!await queryOne(`SELECT id FROM ${tables[entity_type]} WHERE id=$1`,[entity_id])))return res.status(400).json({error:'Choose an existing tenant or landlord record.'});
  const updated=await queryOne('UPDATE chat_conversations SET assigned_to=$2,status=$3,entity_type=$4,entity_id=$5,updated_at=NOW() WHERE id=$1 RETURNING *',[c.id,assigned_to===undefined?c.assigned_to:assigned_to,status||c.status,entity_type||c.entity_type,entity_type?entity_id:c.entity_id]);
  if(entity_type&&c.kind==='whatsapp'){const record=await queryOne(`SELECT ${entity_type==='tenant_enquiry'?"CONCAT_WS(' ',first_name_1,last_name_1)":'name'} AS name FROM ${tables[entity_type]} WHERE id=$1`,[entity_id]);if(record?.name){updated.title=record.name;updated.visitor_name=record.name;await run('UPDATE chat_conversations SET title=$2,visitor_name=$2 WHERE id=$1',[c.id,record.name]);}}
  await auditChat(updated,req.user,status==='closed'?'chat_completed':'chat_updated');res.json(publicConversation(updated));
 });
 app.get('/api/chat/records',...staff,async(req,res)=>{const tables:Record<string,{table:string;name:string}>={tenant:{table:'tenants',name:'name'},landlord:{table:'landlords',name:'name'},tenant_enquiry:{table:'tenant_enquiries',name:"CONCAT_WS(' ',first_name_1,last_name_1)"},landlord_bdm:{table:'landlords_bdm',name:'name'},user:{table:'users',name:'name'}};const type=String(req.query.type||''),t=tables[type];if(!t)return res.sendStatus(400);res.json(await query(`SELECT id,${t.name} AS name FROM ${t.table} WHERE ${t.name} ILIKE $1 ORDER BY name LIMIT 30`,['%'+String(req.query.search||'').slice(0,100)+'%']));});
 app.get('/api/chat/conversations/:id/transcript',authMiddleware,async(req:AuthRequest,res)=>{const c=await access(String(req.params.id),req.user);if(!c)return res.sendStatus(404);res.json({title:c.title,status:c.status,messages:await messages(c.id)});});
 registerPublicChat(app,sendLimit);
}

function registerPublicChat(app:Express,sendLimit:any){
 app.get('/api/public/chat/whatsapp/media/:id',async(req,res)=>{
  const id=String(req.params.id);if(!validWhatsAppMediaToken(id,req.query.expires,req.query.signature,process.env.JWT_SECRET||''))return res.sendStatus(403);
  const file=await queryOne("SELECT f.* FROM chat_files f JOIN chat_conversations c ON c.id=f.conversation_id WHERE f.id=$1 AND c.kind='whatsapp' AND f.message_id IS NOT NULL",[id]);if(!file)return res.sendStatus(404);
  res.set({'Content-Type':file.mime_type,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});res.sendFile(path.resolve(chatRoot(),file.filename));
 });
 app.post('/api/public/chat/whatsapp/status',validateTwilioWebhook,async(req,res)=>{const status=String(req.body.MessageStatus||'');if(['sent','delivered','read','failed','undelivered'].includes(status))await run('UPDATE chat_messages SET status=$2 WHERE provider_id=$1',[String(req.body.MessageSid||''),status]);res.sendStatus(204);});
 const visitor=async(req:Request,res:Response,next:NextFunction)=>{const token=String(req.headers['x-chat-token']||'');if(!/^[a-f0-9]{64}$/.test(token))return res.sendStatus(401);const c=await queryOne("SELECT * FROM chat_conversations WHERE visitor_token_hash=$1 AND kind='live'",[tokenHash(token)]);if(!c)return res.sendStatus(401);(req as any).conversation=c;next();};
 app.get('/api/public/chat/status',rateLimit({windowMs:60000,limit:60}),async(_req,res)=>res.json({online:Boolean(await queryOne("SELECT p.user_id FROM chat_presence p JOIN users u ON u.id=p.user_id WHERE p.last_seen>NOW()-INTERVAL '75 seconds' AND u.is_active=1 AND u.role IN ('staff','manager','admin') LIMIT 1"))}));
 app.post('/api/public/chat/start',rateLimit({windowMs:3600000,limit:8}),async(req,res)=>{
  const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim(),body=String(req.body.message||'').trim();if(!name||name.length>100||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!body||body.length>8000)return res.status(400).json({error:'Enter your name, email address and message.'});
  const token=crypto.randomBytes(32).toString('hex'),id=crypto.randomUUID();const online=await queryOne("SELECT p.user_id FROM chat_presence p JOIN users u ON u.id=p.user_id WHERE p.last_seen>NOW()-INTERVAL '75 seconds' AND u.is_active=1 AND u.role IN ('staff','manager','admin') ORDER BY (SELECT count(*) FROM chat_conversations WHERE assigned_to=p.user_id AND status='open' AND kind='live'),p.last_seen DESC LIMIT 1");
  const c=await queryOne("INSERT INTO chat_conversations(id,kind,title,visitor_name,visitor_email,visitor_token_hash,assigned_to) VALUES($1,'live',$2,$3,$4,$5,$6) RETURNING *",[id,'Website chat — '+name,name,email,tokenHash(token),online?.user_id||null]);await saveMessage(c,null,body,crypto.randomUUID());res.json({token,online:Boolean(online)});
 });
 app.get('/api/public/chat/messages',visitor,async(req,res)=>{const c=(req as any).conversation;res.json({status:c.status,messages:await messages(c.id)});});
 app.post('/api/public/chat/messages',visitor,sendLimit,async(req,res)=>{if(req.body.file_ids?.length||!validChatMessage(req.body))return res.status(400).json({error:'Enter a message up to 8,000 characters.'});try{res.json(await saveMessage((req as any).conversation,null,req.body.body.trim(),req.body.client_id));}catch(e:any){res.status(409).json({error:e.message});}});
 app.get('/api/public/chat/files/:id',visitor,async(req,res)=>{if(!uuid(req.params.id))return res.sendStatus(404);const f=await queryOne('SELECT * FROM chat_files WHERE id=$1 AND conversation_id=$2 AND message_id IS NOT NULL',[req.params.id,(req as any).conversation.id]);if(!f)return res.sendStatus(404);res.setHeader('X-Content-Type-Options','nosniff');res.download(path.join(chatRoot(),f.filename),f.original_name);});
 app.post('/api/public/chat/whatsapp/inbound',validateTwilioWebhook,async(req,res)=>{
  const from=String(req.body.From||''),to=String(req.body.To||''),sid=String(req.body.MessageSid||'');if(!/^whatsapp:\+\d{10,15}$/.test(from)||to!=='whatsapp:'+process.env.TWILIO_PHONE_NUMBER||!/^SM[a-f0-9]{32}$/i.test(sid))return res.sendStatus(400);
  if(await queryOne('SELECT id FROM chat_messages WHERE provider_id=$1',[sid]))return res.type('text/xml').send('<Response/>');
  const phone=from.slice(9),name=String(req.body.ProfileName||phone).slice(0,100);const c=await queryOne("INSERT INTO chat_conversations(id,kind,title,visitor_name,visitor_phone) VALUES($1,'whatsapp',$2,$3,$4) ON CONFLICT(visitor_phone) WHERE kind='whatsapp' DO UPDATE SET status='open' RETURNING *",[crypto.randomUUID(),name,name,phone]);
  if(!c.entity_id){const contact=await findChatContact(phone);if(contact){const linked=await queryOne('UPDATE chat_conversations SET entity_type=$2,entity_id=$3,title=$4,visitor_name=$4 WHERE id=$1 AND entity_id IS NULL RETURNING *',[c.id,contact.entity_type,contact.entity_id,contact.name]);if(linked){Object.assign(c,linked);await run("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES('System','chat_linked',$1,$2,$3)",[contact.entity_type,contact.entity_id,JSON.stringify({conversation_id:c.id,channel:'whatsapp',source:'known_phone_number'})]);}}}
  await saveMessage(c,null,String(req.body.Body||'Attachment received in WhatsApp').slice(0,8000),crypto.randomUUID(),[],sid);res.type('text/xml').send('<Response/>');
 });
}
