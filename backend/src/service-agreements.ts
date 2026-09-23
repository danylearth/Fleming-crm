import type {Express} from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import pool,{query,queryOne,run} from './db-pg';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import {sendEmail,OUTBOUND_EMAIL_ADDRESS} from './email';
import {prepareEmailHtml} from './email-presentation';
import {servicePdf,signedServicePdf,serviceNames} from './service-agreement-pdf';
const root=()=>process.env.UPLOADS_PATH||path.join(__dirname,'../uploads');
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const signedServiceSql=(propertyAlias='p')=>`EXISTS(SELECT 1 FROM landlord_service_agreements sa WHERE sa.property_id=${propertyAlias}.id AND sa.landlord_id=${propertyAlias}.landlord_id AND sa.service_type=${propertyAlias}.service_type AND sa.status='signed')`;
export async function serviceGate(propertyId:number){
 const p=await queryOne(`SELECT p.id,l.landlord_type,${signedServiceSql()} AS signed FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE p.id=$1`,[propertyId]);
 return p&&p.landlord_type!=='internal'&&!p.signed?'The landlord must sign the property service agreement before marketing or tenant onboarding can proceed.':null;
}
const renderStored=(a:any)=>a.source_filename?fs.readFile(path.join(root(),a.source_filename)).then(source=>servicePdf(a,source)):servicePdf(a);
const safe=(a:any)=>{if(!a)return a;const {signature,signature_ip,signature_user_agent,...rest}=a;return {...rest,signing_url:`https://apply.fleminglettings.co.uk/service-agreement.html?token=${a.token}`};};
const audit=async(c:any,user:any,action:string,a:any)=>c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,'property',$4,$5)",[user?.id||null,user?.email||null,action,a.property_id,JSON.stringify({service_agreement_id:a.id,service_type:a.service_type,status:a.status})]);
async function context(id:number){
 const p=await queryOne('SELECT p.*,l.name AS landlord_name,l.address AS landlord_address,l.home_address,l.email AS landlord_email,l.phone AS landlord_phone,l.company_number,l.entity_type,l.landlord_type FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE p.id=$1',[id]);
 if(!p)return null;
 const bank=await queryOne('SELECT * FROM landlord_bank_details WHERE landlord_id=$1',[p.landlord_id]);
 const directors=await query('SELECT name FROM directors WHERE landlord_id=$1 AND COALESCE(archived,0)=0 ORDER BY name',[p.landlord_id]);
 return {property:p,bank:bank||{},directors,agreements:(await query('SELECT * FROM landlord_service_agreements WHERE property_id=$1 ORDER BY id DESC',[id])).map(safe)};
}
async function emailContent(a:any){
 let html=await fs.readFile(path.join(__dirname,'email-templates',`service-${a.service_type}.html`),'utf8');
 html=html.replace(/src="([^"/]+\.png)"/g,'src="https://crm.fleminglettings.co.uk/email-assets/$1"').split('https://apply.fleminglettings.co.uk/').join(safe(a).signing_url);
 html=html.split('LANDLORD NAME').join(esc(a.details.landlord_name)).split('PROPERTY ADDRESS').join(esc(a.details.property_address));
 html=html.replace(/(?<![0-9])% of first month/g,`${a.setup_fee}% of first month`).replace(/(?<![0-9])% of (?:monthly )?rent/g,`${a.monthly_fee}% of rent`);
 return {subject:`${serviceNames[a.service_type]} service agreement - ${a.details.property_address}`,html:prepareEmailHtml(html),to:a.details.landlord_email};
}
export function registerServiceAgreements(app:Express){
 const publicLimit=rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:true,legacyHeaders:false});
 app.get('/api/properties/:id/service-agreements',authMiddleware,requirePermission('staff'),async(req,res)=>{const data=await context(Number(req.params.id));if(!data)return res.sendStatus(404);res.json(data);});
 app.get('/api/landlords/:id/service-agreements',authMiddleware,requirePermission('staff'),async(req,res)=>res.json((await query('SELECT a.*,p.address AS property_address FROM landlord_service_agreements a JOIN properties p ON p.id=a.property_id WHERE a.landlord_id=$1 ORDER BY a.id DESC',[req.params.id])).map(safe)));
 app.post('/api/properties/:id/service-agreements',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const ctx=await context(Number(req.params.id));if(!ctx||ctx.property.landlord_type==='internal')return res.status(400).json({error:'Choose a client property with a linked landlord'});
  const p=ctx.property,d=req.body,service=p.service_type,setup=Number(d.setup_fee),monthly=service==='let_only'?0:Number(d.monthly_fee);
  if(!serviceNames[service]||d.setup_fee===''||d.setup_fee==null||(!['let_only'].includes(service)&&(d.monthly_fee===''||d.monthly_fee==null))||![setup,monthly].every(n=>Number.isFinite(n)&&n>=0&&n<=100))return res.status(400).json({error:'Enter agreed fees between 0 and 100 percent'});
  const bank={account_name:String(ctx.bank.account_name||''),sort_code:String(ctx.bank.sort_code||''),account_number:String(ctx.bank.account_number||''),bank_name:String(ctx.bank.bank_name||'')};
  if(!ctx.bank.approved_at)return res.status(400).json({error:'An administrator must first approve the landlord bank details'});
  const details={agreement_date:new Date().toISOString().slice(0,10),landlord_name:p.landlord_name,landlord_address:p.home_address||p.landlord_address,landlord_email:p.landlord_email,landlord_phone:p.landlord_phone,company_number:p.company_number||'',signatory_name:String(d.signatory_name||'').trim(),property_address:[p.address,p.postcode].filter(Boolean).join(', '),asking_rent:Number(p.rent_amount)};
  if(!details.landlord_address||!details.landlord_phone||!details.asking_rent||!details.landlord_email||!/^\S+@\S+\.\S+$/.test(details.landlord_email)||(p.entity_type==='company'&&(!details.company_number||!details.signatory_name)))return res.status(400).json({error:'Complete the landlord address, email, phone, asking rent and company signatory details first'});
  const a:any={property_id:p.id,landlord_id:p.landlord_id,service_type:service,setup_fee:setup,monthly_fee:monthly,payment_route:service==='let_only'?'landlord':'fleming_client_money',details,bank_details:bank};
  const c=await pool.connect();let file:string|undefined,sourceFile:string|undefined;
  try{await c.query('BEGIN');await c.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE',[p.id]);
   if((await c.query("SELECT id FROM landlord_service_agreements WHERE property_id=$1 AND status<>'void'",[p.id])).rows.length){await c.query('ROLLBACK');return res.status(409).json({error:'Void the current service agreement before creating a replacement'});}
   const source=await fs.readFile(path.join(__dirname,'agreement-assets',`service-${service}.docx`));const pdf=await servicePdf(a,source);file=`service-${crypto.randomUUID()}.pdf`;sourceFile=file.replace('.pdf','.docx');await fs.mkdir(root(),{recursive:true});await fs.writeFile(path.join(root(),sourceFile),source,{mode:0o600});await fs.writeFile(path.join(root(),file),pdf,{mode:0o600});
   const saved=(await c.query('INSERT INTO landlord_service_agreements(property_id,landlord_id,service_type,setup_fee,monthly_fee,payment_route,token,details,bank_details,filename,created_by,source_filename) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[p.id,p.landlord_id,service,setup,monthly,a.payment_route,crypto.randomBytes(32).toString('hex'),JSON.stringify(details),JSON.stringify(bank),file,req.user.id,sourceFile])).rows[0];await audit(c,req.user,'service_agreement_created',saved);await c.query('COMMIT');res.status(201).json(safe(saved));
  }catch(e){await c.query('ROLLBACK');if(file)await fs.unlink(path.join(root(),file)).catch(()=>{});if(sourceFile)await fs.unlink(path.join(root(),sourceFile)).catch(()=>{});throw e;}finally{c.release();}
 });
 app.get('/api/service-agreements/:id/pdf',authMiddleware,requirePermission('staff'),async(req,res)=>{const a=await queryOne('SELECT * FROM landlord_service_agreements WHERE id=$1',[req.params.id]);if(!a)return res.sendStatus(404);res.type('pdf').set('Cache-Control','no-store').send(await fs.readFile(path.join(root(),a.signed_filename||a.filename)));});
 app.post('/api/service-agreements/:id/preview',authMiddleware,requirePermission('staff'),async(req,res)=>{const a=await queryOne('SELECT * FROM landlord_service_agreements WHERE id=$1',[req.params.id]);if(!a)return res.sendStatus(404);res.json(await emailContent(a));});
 app.post('/api/service-agreements/:id/send',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const c=await pool.connect();try{await c.query('BEGIN');const a=(await c.query('SELECT * FROM landlord_service_agreements WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!a||!['draft','issued'].includes(a.status)){await c.query('ROLLBACK');return res.status(409).json({error:'This agreement is no longer awaiting a signature'});}
   if(a.last_sent_at&&Date.now()-new Date(a.last_sent_at).getTime()<60000){await c.query('ROLLBACK');return res.status(429).json({error:'Please wait one minute before resending'});}
   const content=await emailContent(a),attempt=crypto.randomUUID();const result=await sendEmail({...content,idempotencyKey:`service-${a.id}-${attempt}`});
   await c.query("UPDATE landlord_service_agreements SET status='issued',issued_at=COALESCE(issued_at,NOW()),last_sent_at=NOW(),delivery_status=$2,delivery_error=$3 WHERE id=$1",[a.id,result.simulated?'simulated':result.success?'sent':'failed',result.error||null]);
   await c.query("INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,sent_by,sent_by_email,error_message) VALUES($1,'landlord',$2,$3,$4,$5,'service_agreement',$6,$7,$8,$9,$10)",[result.id||null,a.landlord_id,content.to,OUTBOUND_EMAIL_ADDRESS,content.subject,content.html,result.simulated?'simulated':result.success?'sent':'failed',req.user.id,req.user.email,result.error||null]);
   await audit(c,req.user,'service_agreement_sent',a);await c.query('COMMIT');res.status(result.success?200:502).json({success:result.success,simulated:result.simulated,error:result.error});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
 app.post('/api/service-agreements/:id/void',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{const c=await pool.connect();try{await c.query('BEGIN');const a=(await c.query("UPDATE landlord_service_agreements SET status='void' WHERE id=$1 AND status<>'void' RETURNING *",[req.params.id])).rows[0];if(a)await audit(c,req.user,'service_agreement_voided',a);await c.query('COMMIT');res.json({success:true});}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}});
 app.get('/api/public/service-agreements/:token',publicLimit,async(req,res)=>{const a=await queryOne("SELECT * FROM landlord_service_agreements WHERE token=$1 AND status IN ('issued','signed')",[req.params.token]);if(!a)return res.status(404).json({error:'Agreement not found or not yet issued'});res.set('Cache-Control','no-store').json({id:a.id,status:a.status,service_name:serviceNames[a.service_type],service_type:a.service_type,details:a.details,bank_details:a.bank_details,payment_route:a.payment_route,setup_fee:a.setup_fee,monthly_fee:a.monthly_fee,signed_at:a.signed_at});});
 app.get('/api/public/service-agreements/:token/pdf',publicLimit,async(req,res)=>{const a=await queryOne("SELECT * FROM landlord_service_agreements WHERE token=$1 AND status IN ('issued','signed')",[req.params.token]);if(!a)return res.sendStatus(404);res.type('pdf').set('Cache-Control','no-store').send(await fs.readFile(path.join(root(),a.signed_filename||a.filename)));});
 app.post('/api/public/service-agreements/:token/preview',publicLimit,async(req,res)=>{
  const a=await queryOne("SELECT * FROM landlord_service_agreements WHERE token=$1 AND status='issued'",[req.params.token]);if(!a)return res.status(409).json({error:'Agreement is unavailable for signing'});
  const d=req.body,b=d.bank_details;if(!b||!String(b.account_name||'').trim()||String(b.account_name).length>150||!String(b.bank_name||'').trim()||String(b.bank_name).length>150||!/^\d{6}$/.test(String(b.sort_code||'').replace(/[^0-9]/g,''))||!/^\d{8}$/.test(String(b.account_number||''))||!String(d.signer_name||'').trim()||String(d.signer_name).length>150||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.signature||'')||d.signature.length>750000)return res.status(400).json({error:'Enter valid bank details, your name and signature'});
  try{await sharp(Buffer.from(d.signature.split(',')[1],'base64'),{limitInputPixels:4000000}).png().toBuffer();}catch{return res.status(400).json({error:'Draw a valid signature'});}
  a.bank_details={account_name:String(b.account_name).trim(),bank_name:String(b.bank_name).trim(),sort_code:String(b.sort_code).replace(/[^0-9]/g,'').replace(/(\d{2})(\d{2})(\d{2})/,'$1-$2-$3'),account_number:String(b.account_number)};a.signer_name=String(d.signer_name).trim();a.signature=d.signature;a.signed_at=new Date().toISOString();a.signature_ip=req.ip;
  res.type('pdf').set('Cache-Control','no-store').send(await signedServicePdf(await renderStored(a),a,true));
 });
 app.post('/api/public/service-agreements/:token/sign',publicLimit,async(req,res)=>{
  const d=req.body;if(d.accepted_terms!==true||d.bank_approved!==true||d.start_immediately!==true||!String(d.signer_name||'').trim()||String(d.signer_name).length>150||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.signature||'')||d.signature.length>750000)return res.status(400).json({error:'Sign and accept the terms, immediate commencement and bank details'});
  try{await sharp(Buffer.from(d.signature.split(',')[1],'base64'),{limitInputPixels:4000000}).png().toBuffer();}catch{return res.status(400).json({error:'Draw a valid signature'});}
  const c=await pool.connect();let signedFile:string|undefined;
  try{await c.query('BEGIN');const a=(await c.query('SELECT * FROM landlord_service_agreements WHERE token=$1 FOR UPDATE',[req.params.token])).rows[0];if(!a||a.status!=='issued'){await c.query('ROLLBACK');return res.status(409).json({error:'This agreement has already been signed or is unavailable'});}
   const p=(await c.query('SELECT landlord_id,service_type FROM properties WHERE id=$1 FOR UPDATE',[a.property_id])).rows[0];if(p.landlord_id!==a.landlord_id||p.service_type!==a.service_type){await c.query('ROLLBACK');return res.status(409).json({error:'The property details changed. Please ask the office for a replacement agreement.'});}
   const bank={account_name:String(d.bank_details?.account_name||'').trim(),sort_code:String(d.bank_details?.sort_code||'').replace(/[^0-9]/g,''),account_number:String(d.bank_details?.account_number||'').trim(),bank_name:String(d.bank_details?.bank_name||'').trim()};
   if(!bank.account_name||bank.account_name.length>150||!bank.bank_name||bank.bank_name.length>150||!/^\d{6}$/.test(bank.sort_code)||!/^\d{8}$/.test(bank.account_number)){await c.query('ROLLBACK');return res.status(400).json({error:'Enter valid bank details'});}bank.sort_code=bank.sort_code.replace(/(\d{2})(\d{2})(\d{2})/,'$1-$2-$3');
   a.bank_changed=Object.keys(bank).some(k=>String(a.bank_details[k])!==bank[k as keyof typeof bank]);a.bank_details=bank;a.signer_name=String(d.signer_name).trim();a.signature=d.signature;a.signed_at=new Date().toISOString();a.signature_ip=req.ip;a.signature_user_agent=String(req.headers['user-agent']||'').slice(0,500);a.status='signed';
   // Re-render Section A with the approved bank account so the contract and certificate agree.
   const signed=await signedServicePdf(await renderStored(a),a);signedFile=`service-signed-${a.id}-${crypto.randomUUID()}.pdf`;await fs.writeFile(path.join(root(),signedFile),signed,{mode:0o600});
   await c.query("UPDATE landlord_service_agreements SET status='signed',bank_details=$2,bank_changed=$3,signer_name=$4,signature=$5,signed_at=$6,signature_ip=$7,signature_user_agent=$8,signed_filename=$9 WHERE id=$1",[a.id,JSON.stringify(bank),a.bank_changed,a.signer_name,a.signature,a.signed_at,a.signature_ip,a.signature_user_agent,signedFile]);
   await c.query('UPDATE properties SET charge_percentage=$2::numeric,total_charge=ROUND((rent_amount*$2::numeric/100)::numeric,2),updated_at=NOW() WHERE id=$1',[a.property_id,a.service_type==='let_only'?a.setup_fee:a.monthly_fee]);
   const master=(await c.query('SELECT * FROM landlord_bank_details WHERE landlord_id=$1 FOR UPDATE',[a.landlord_id])).rows[0];
   if(master&&Object.keys(bank).every(k=>String(master[k])===bank[k as keyof typeof bank]))await c.query('UPDATE landlord_bank_details SET landlord_approved_at=$2,landlord_approved_name=$3 WHERE landlord_id=$1',[a.landlord_id,a.signed_at,a.signer_name]);
   const name=`${a.details.property_address} - ${serviceNames[a.service_type]} Service Agreement - ${a.signed_at.slice(0,10)}.pdf`;
   for(const [type,id] of [['property',a.property_id],['landlord',a.landlord_id]])await c.query("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size) VALUES($1,$2,'service_agreement',$3,$4,'application/pdf',$5)",[type,id,signedFile,name,signed.length]);
   await audit(c,null,'service_agreement_signed',a);await c.query('COMMIT');res.json({success:true,signed_at:a.signed_at});
  }catch(e){await c.query('ROLLBACK');if(signedFile)await fs.unlink(path.join(root(),signedFile)).catch(()=>{});throw e;}finally{c.release();}
 });
}
