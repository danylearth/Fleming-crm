import type {Express,Request,Response,NextFunction} from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {rateLimit} from 'express-rate-limit';
import pool,{query,queryOne,run} from './db-pg';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import {validChatFile} from './chat';
import {financialDocumentPdf,financialNumber} from './financial-document-pdf';

const base='/api/public/landlord-portal';
const hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const root=()=>process.env.UPLOADS_PATH||path.join(__dirname,'../uploads');
type Account={id:string;landlord_id:number|null;bdm_id:number|null;email:string;kind:string;chat_id:string|null};
type PortalRequest=Request&{portal?:Account};
export const portalPropertyScope=`(p.landlord_id=$1 OR EXISTS(SELECT 1 FROM property_landlords pl WHERE pl.property_id=p.id AND pl.landlord_id=$1))`;
const publicDocumentTypes=['eicr','epc','gas safety','gas safety certificate','gas_safety','gas_certificate','electrical safety certificate','energy performance certificate','inventory','completed inventory','service_agreement','service agreement (issued)','tenancy agreement','signed tenancy agreement','assured periodic tenancy','signed assured periodic tenancy'];
export function validPortalPassword(value:unknown){return typeof value==='string'&&value.length>=12&&value.length<=128;}
export function safePortalFilename(filename:string){return Boolean(filename)&&path.basename(filename)===filename&&!filename.includes('\\')&&!filename.includes('/');}
async function audit(account:Account,action:string,changes:unknown){await run("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5)",[account.email,action,account.landlord_id?'landlord':'landlord_bdm',account.landlord_id||account.bdm_id,JSON.stringify({portal:true,...changes as object})]);}
async function issueToken(accountId:string,kind:'session'|'invite'|'preview'){
 const token=crypto.randomBytes(32).toString('base64url');const seconds=kind==='preview'?1800:kind==='invite'?86400:28800;
 await run("INSERT INTO landlord_portal_tokens(token_hash,account_id,kind,expires_at) VALUES($1,$2,$3,NOW()+($4*INTERVAL '1 second'))",[hash(token),accountId,kind,seconds]);return token;
}
export async function ensureLandlordPortalAccount(landlordId:number|null,bdmId:number|null,client:any=pool){
 const table=landlordId?'landlords':'landlords_bdm',id=landlordId||bdmId;
 const person=(await client.query(`SELECT id,email FROM ${table} WHERE id=$1`,[id])).rows[0];
 if(!person?.email)return null;
 const existing=(await client.query('SELECT * FROM landlord_portal_accounts WHERE landlord_id=$1 OR bdm_id=$2',[landlordId,bdmId])).rows[0];
 if(existing)return existing;
 // Never attach an existing email account to a different CRM person automatically.
 return (await client.query('INSERT INTO landlord_portal_accounts(id,landlord_id,bdm_id,email) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING *',[crypto.randomUUID(),landlordId,bdmId,person.email.trim().toLowerCase()])).rows[0]||null;
}
async function portalAuth(req:PortalRequest,res:Response,next:NextFunction){
 const token=req.headers.authorization?.replace(/^Bearer /,'')||'';
 if(!/^[\w-]{43}$/.test(token))return res.status(401).json({error:'Please sign in to your landlord account.'});
 const account=await queryOne("SELECT a.id,a.landlord_id,a.bdm_id,a.email,a.chat_id,t.kind FROM landlord_portal_tokens t JOIN landlord_portal_accounts a ON a.id=t.account_id WHERE t.token_hash=$1 AND t.expires_at>NOW() AND t.kind IN('session','preview') AND a.active=TRUE",[hash(token)]);
 if(!account)return res.status(401).json({error:'Your session has expired. Please sign in again.'});
 req.portal=account;
 if(account.kind==='preview'&&!['GET','HEAD'].includes(req.method)&&!req.path.endsWith('/logout'))return res.status(403).json({error:'Office preview is read-only. Sign in as the landlord to make changes.'});
 next();
}
async function ownedProperties(a:Account){return query(`SELECT p.id,p.address,p.postcode,p.bedrooms,p.property_type,p.rent_amount,p.service_type,p.status,p.tenancy_start_date,p.tenancy_end_date,p.onboarded_date,p.eicr_expiry_date,p.epc_expiry_date,p.gas_safety_expiry_date,p.has_gas FROM properties p WHERE ${portalPropertyScope} AND p.archived_at IS NULL ORDER BY p.address`,[a.landlord_id]);}
async function ownedDocuments(a:Account){return query(`SELECT d.id,d.doc_type,d.original_name,d.mime_type,d.size,d.uploaded_at,d.review_status,d.entity_type,d.entity_id FROM documents d WHERE (d.entity_type='landlord' AND d.entity_id=$1) OR (d.entity_type='landlord_bdm' AND d.entity_id=$2) OR (d.entity_type='property' AND lower(d.doc_type)=ANY($3::text[]) AND EXISTS(SELECT 1 FROM properties p WHERE p.id=d.entity_id AND ${portalPropertyScope})) ORDER BY d.uploaded_at DESC,d.id DESC`,[a.landlord_id,a.bdm_id,publicDocumentTypes]);}
export function registerLandlordPortal(app:Express){
 const loginLimit=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-8',legacyHeaders:false});
 app.post(base+'/login',loginLimit,async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  if(password.length>128)return res.status(401).json({error:'Email or password is incorrect.'});
  const account=await queryOne('SELECT * FROM landlord_portal_accounts WHERE email=$1 AND active=TRUE',[email]);
  if(!account?.password_hash||!await bcrypt.compare(password,account.password_hash))return res.status(401).json({error:'Email or password is incorrect.'});
  const token=await issueToken(account.id,'session');await audit(account,'login',{});res.json({token});
 });
 app.post(base+'/activate',loginLimit,async(req,res)=>{
  if(!validPortalPassword(req.body.password))return res.status(400).json({error:'Use a password between 12 and 128 characters.'});
  const c=await pool.connect();try{await c.query('BEGIN');
   const invite=(await c.query("SELECT t.account_id FROM landlord_portal_tokens t JOIN landlord_portal_accounts a ON a.id=t.account_id WHERE t.token_hash=$1 AND t.kind='invite' AND t.expires_at>NOW() AND a.active=TRUE FOR UPDATE OF t,a",[hash(String(req.body.token||''))])).rows[0];
   if(!invite){await c.query('ROLLBACK');return res.status(400).json({error:'This setup link is invalid or has expired. Ask the office for a new link.'});}
   await c.query('UPDATE landlord_portal_accounts SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(req.body.password,12),invite.account_id]);
   await c.query('DELETE FROM landlord_portal_tokens WHERE account_id=$1',[invite.account_id]);await c.query('COMMIT');res.json({token:await issueToken(invite.account_id,'session')});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
 app.use(base,portalAuth);
 app.post(base+'/logout',async(req,res)=>{await run('DELETE FROM landlord_portal_tokens WHERE token_hash=$1',[hash(req.headers.authorization?.replace(/^Bearer /,'')||'')]);res.json({success:true});});
 app.get(base+'/workspace',async(req:PortalRequest,res)=>{
  const a=req.portal!;const profile=await queryOne(a.landlord_id?'SELECT name,email,phone,address,kyc_completed FROM landlords WHERE id=$1':'SELECT name,email,phone,address,status FROM landlords_bdm WHERE id=$1',[a.landlord_id||a.bdm_id]);
  const properties=await ownedProperties(a),ids=properties.map(p=>p.id);
  const maintenance=await query('SELECT id,property_id,title,description,status,priority,created_at,updated_at,resolution_notes FROM maintenance WHERE property_id=ANY($1::int[]) ORDER BY updated_at DESC',[ids]);
  const payments=await query('SELECT id,property_id,due_date,amount_due,amount_paid,payment_date,status FROM rent_payments WHERE property_id=ANY($1::int[]) ORDER BY due_date DESC LIMIT 250',[ids]);
  const statements=await query("SELECT id,kind,created_at FROM financial_documents WHERE landlord_id=$1 ORDER BY created_at DESC LIMIT 100",[a.landlord_id]);
  const bank=await queryOne('SELECT account_name,bank_name,RIGHT(account_number,4) AS ending,approved_at FROM landlord_bank_details WHERE landlord_id=$1',[a.landlord_id]);
  const requests=await query('SELECT id,kind,status,created_at,reviewed_at FROM landlord_portal_requests WHERE account_id=$1 ORDER BY created_at DESC',[a.id]);
  const service=await query("SELECT id,property_id,service_type,status,issued_at,signed_at,CASE WHEN status='issued' THEN token END AS signing_token FROM landlord_service_agreements WHERE landlord_id=$1 AND status IN('issued','signed') ORDER BY created_at DESC",[a.landlord_id]);
  const agreements=await query("SELECT id,property_id,original_name,status,landlord_signed_at,completed_at,CASE WHEN status='issued' AND landlord_signed_at IS NULL THEN landlord_token END AS signing_token,landlord_slug FROM tenancy_agreements WHERE property_id=ANY($1::int[]) AND status IN('issued','completed') AND requires_landlord_signature=1 ORDER BY issued_at DESC",[ids]);
  const signatures=await query("SELECT r.id,r.title,r.status,s.signed_at,s.token,s.signing_slug FROM signature_recipients s JOIN signature_requests r ON r.id=s.request_id WHERE s.entity_type='landlord' AND s.entity_id=$1 AND lower(s.email)=$2 AND r.status IN('sent','completed','partially_signed') AND (r.expires_at IS NULL OR r.expires_at>NOW()) ORDER BY r.created_at DESC",[a.landlord_id,a.email]);
  res.json({profile,readOnly:a.kind==='preview',properties,maintenance,payments,statements,bank,requests,documents:await ownedDocuments(a),service,agreements,signatures});
 });
 app.get(base+'/documents/:id',async(req:PortalRequest,res)=>{
  const allowed=(await ownedDocuments(req.portal!)).find(d=>String(d.id)===String(req.params.id));if(!allowed)return res.sendStatus(404);
  const d=await queryOne('SELECT filename,original_name FROM documents WHERE id=$1',[allowed.id]);if(!safePortalFilename(d?.filename))return res.sendStatus(404);
  res.setHeader('X-Content-Type-Options','nosniff');res.download(path.join(root(),d.filename),d.original_name);
 });
 app.get(base+'/statements/:id',async(req:PortalRequest,res)=>{
  const d=await queryOne('SELECT * FROM financial_documents WHERE id=$1 AND landlord_id=$2',[req.params.id,req.portal!.landlord_id]);if(!d)return res.sendStatus(404);
  const pdf=await financialDocumentPdf(d);res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${financialNumber(d)}.pdf"`}).send(pdf);
 });
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}}).single('file');
 app.post(base+'/documents',rateLimit({windowMs:15*60000,limit:30}),upload,async(req:PortalRequest,res)=>{
  const file=req.file,kind=String(req.body.kind||'');if(!file||!['Primary Identification','Secondary Identification','Property Document'].includes(kind))return res.status(400).json({error:'Choose a document type and a PDF or image up to 10 MB.'});
  const ext=path.extname(file.originalname).toLowerCase();if(!['.pdf','.png','.jpg','.jpeg','.webp'].includes(ext)||!validChatFile(ext,file.buffer))return res.status(400).json({error:'Upload a valid PDF, PNG, JPG or WebP file.'});
  const a=req.portal!,filename='landlord-portal-'+crypto.randomUUID()+ext;await fs.promises.writeFile(path.join(root(),filename),file.buffer,{flag:'wx'});
  try{await run("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,review_status) VALUES($1,$2,$3,$4,$5,$6,$7,'pending')",[a.landlord_id?'landlord':'landlord_bdm',a.landlord_id||a.bdm_id,kind,filename,path.basename(file.originalname),ext==='.pdf'?'application/pdf':ext==='.jpg'||ext==='.jpeg'?'image/jpeg':'image/'+ext.slice(1),file.size]);await audit(a,'create',{document_type:kind});res.status(201).json({success:true});}catch(e){await fs.promises.unlink(path.join(root(),filename));throw e;}
 });
 app.post(base+'/bank-change',async(req:PortalRequest,res)=>{
  const a=req.portal!;if(!a.landlord_id)return res.status(409).json({error:'The office will enable bank details once your landlord record is ready.'});
  const account_name=String(req.body.account_name||'').trim(),bank_name=String(req.body.bank_name||'').trim(),sort_code=String(req.body.sort_code||'').replace(/[- ]/g,''),account_number=String(req.body.account_number||'').replace(/ /g,'');
  if(!account_name||account_name.length>120||bank_name.length>120||!/^\d{6}$/.test(sort_code)||!/^\d{8}$/.test(account_number))return res.status(400).json({error:'Enter an account name, six-digit sort code and eight-digit account number.'});
  const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM landlord_portal_accounts WHERE id=$1 FOR UPDATE',[a.id]);
   if((await c.query("SELECT id FROM landlord_portal_requests WHERE account_id=$1 AND kind='bank_change' AND status='pending'",[a.id])).rowCount){await c.query('ROLLBACK');return res.status(409).json({error:'A bank change is already awaiting office verification.'});}
   const request=(await c.query("INSERT INTO landlord_portal_requests(account_id,kind,details) VALUES($1,'bank_change',$2) RETURNING id",[a.id,JSON.stringify({account_name,bank_name,sort_code,account_number})])).rows[0];
   await c.query("INSERT INTO tasks(title,description,status,priority,entity_type,entity_id,task_type,due_date) VALUES('Verify landlord portal bank change',$1,'pending','high','landlord',$2,'follow_up',CURRENT_DATE)",['Portal request #'+request.id+'. Verify the bank change with the landlord using their known contact details. Account ending '+account_number.slice(-4)+'. Review in Landlord Portal Access.',a.landlord_id]);
   await c.query('COMMIT');await audit(a,'create',{bank_change_request:request.id,account_ending:account_number.slice(-4)});res.status(201).json({success:true});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
 app.get(base+'/chat',async(req:PortalRequest,res)=>{
  const a=req.portal!;const messages=a.chat_id?await query('SELECT id,sender_name,sender_id IS NOT NULL AS from_office,body,created_at FROM chat_messages WHERE conversation_id=$1 ORDER BY id',[a.chat_id]):[];
  const online=Boolean(await queryOne("SELECT p.user_id FROM chat_presence p JOIN users u ON u.id=p.user_id WHERE p.last_seen>NOW()-INTERVAL '75 seconds' AND u.is_active=1 AND u.role IN('staff','manager','admin') LIMIT 1"));res.json({messages,online});
 });
 app.post(base+'/chat',rateLimit({windowMs:60000,limit:20}),async(req:PortalRequest,res)=>{
  const a=req.portal!,body=String(req.body.body||'').trim();if(!body||body.length>8000)return res.status(400).json({error:'Enter a message up to 8,000 characters.'});
  const c=await pool.connect();try{await c.query('BEGIN');const account=(await c.query('SELECT chat_id FROM landlord_portal_accounts WHERE id=$1 FOR UPDATE',[a.id])).rows[0];
   let id=account.chat_id;const person=await queryOne(a.landlord_id?'SELECT name FROM landlords WHERE id=$1':'SELECT name FROM landlords_bdm WHERE id=$1',[a.landlord_id||a.bdm_id]);
   if(!id){id=crypto.randomUUID();await c.query("INSERT INTO chat_conversations(id,kind,title,visitor_name,visitor_email,entity_type,entity_id) VALUES($1,'live',$2,$3,$4,$5,$6)",[id,'Landlord portal — '+person.name,person.name,a.email,a.landlord_id?'landlord':'landlord_bdm',a.landlord_id||a.bdm_id]);await c.query('UPDATE landlord_portal_accounts SET chat_id=$1 WHERE id=$2',[id,a.id]);}
   await c.query("UPDATE chat_conversations SET status='open',updated_at=NOW(),last_customer_message_at=NOW() WHERE id=$1",[id]);await c.query('INSERT INTO chat_messages(conversation_id,sender_name,body,client_id) VALUES($1,$2,$3,$4)',[id,person.name,body,crypto.randomUUID()]);await c.query('COMMIT');await audit(a,'create',{channel:'landlord_portal_chat'});res.status(201).json({success:true});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
 // Staff tools never accept a landlord session. Provisioning does not send email.
 const staff=[authMiddleware,requirePermission('manager')];
 app.get('/api/landlords/:id/portal-access',...staff,async(req,res)=>{
  const a=await queryOne('SELECT id,email,active,password_hash IS NOT NULL AS activated FROM landlord_portal_accounts WHERE landlord_id=$1',[req.params.id]);
  const requests=a?await query("SELECT id,details,status,created_at FROM landlord_portal_requests WHERE account_id=$1 AND status='pending' ORDER BY created_at",[a.id]):[];res.json({account:a,requests});
 });
 app.post('/api/landlords/:id/portal-access',...staff,async(req:AuthRequest,res)=>{
  const a=await ensureLandlordPortalAccount(Number(req.params.id),null);if(!a)return res.status(409).json({error:'Add a unique landlord email address before enabling access.'});
  const kind=req.body.kind==='preview'?'preview':'invite';if(kind==='invite')await run("DELETE FROM landlord_portal_tokens WHERE account_id=$1 AND kind='invite'",[a.id]);
  const token=await issueToken(a.id,kind);await run("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','landlord',$3,$4)",[req.user!.id,req.user!.email,Number(req.params.id),JSON.stringify({portal_access:kind})]);res.json({token,kind});
 });
 app.post('/api/landlords/:id/portal-access/revoke',...staff,async(req:AuthRequest,res)=>{
  const a=await queryOne('UPDATE landlord_portal_accounts SET active=FALSE WHERE landlord_id=$1 RETURNING id',[req.params.id]);if(a)await run('DELETE FROM landlord_portal_tokens WHERE account_id=$1',[a.id]);await run("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','landlord',$3,$4)",[req.user!.id,req.user!.email,Number(req.params.id),JSON.stringify({portal_access:'revoked'})]);res.json({success:true});
 });
}
