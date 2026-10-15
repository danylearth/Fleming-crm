import {agreementConsentSnapshot} from './agreement-consent';
import {syncLandlordBankApprovalTask} from './landlord-bank-approval-task';
import {serviceSigningUrl,parseServiceSigningSlug} from './service-agreement-links';
import {getCompanySettings} from './company-settings';
import {serviceReadySql} from './service-workflow';
import {sendSms,normalizeUkPhone,SMS_FROM} from './sms';
import {propertyServiceFees} from './property-service-fees';
import type {Express,RequestHandler} from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import pool,{query,queryOne,run} from './db-pg';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import {sendEmail,completedLandlordAgreementEmail,OUTBOUND_EMAIL_ADDRESS,normalizePropertyAddress} from './email';
import {prepareEmailHtml} from './email-presentation';
import {servicePdf,signedServicePdf,serviceNames} from './service-agreement-pdf';
const root=()=>process.env.UPLOADS_PATH||path.join(__dirname,'../uploads');
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const signedServiceSql=serviceReadySql;
export async function serviceGate(propertyId:number){
 const p=await queryOne(`SELECT p.id,l.landlord_type,${signedServiceSql()} AS signed FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE p.id=$1`,[propertyId]);
 return p&&p.landlord_type!=='internal'&&!p.signed?'The landlord must sign the property service agreement before marketing or tenant onboarding can proceed.':null;
}
const renderStored=(a:any)=>a.source_filename?fs.readFile(path.join(root(),a.source_filename)).then(source=>servicePdf(a,source)):servicePdf(a);
const SERVICE_PDF_PRESENTATION='2026-10-15-consistent-signing-layout';
export const readAgreementPdf=(a:any)=>['draft','issued'].includes(a.status)&&a.details?.pdf_presentation!==SERVICE_PDF_PRESENTATION?renderStored(a):fs.readFile(path.join(root(),a.signed_filename||a.filename));
const safe=(a:any)=>{if(!a)return a;const {signature,signature_ip,signature_user_agent,...rest}=a;const {companySettings,...details}=a.details||{};return {...rest,details,signing_url:serviceSigningUrl(a)};};
const audit=async(c:any,user:any,action:string,a:any)=>c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,'property',$4,$5)",[user?.id||null,user?.email||null,action,a.property_id,JSON.stringify({service_agreement_id:a.id,service_type:a.service_type,status:a.status})]);
async function context(id:number){
 const p=await queryOne('SELECT p.*,l.name AS landlord_name,l.address AS landlord_address,l.home_address,l.email AS landlord_email,l.phone AS landlord_phone,l.company_number,l.entity_type,l.landlord_type FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE p.id=$1',[id]);
 if(!p)return null;
 const bank=await queryOne('SELECT * FROM landlord_bank_details WHERE landlord_id=$1',[p.landlord_id]);
 const directors=await query('SELECT name FROM directors WHERE landlord_id=$1 AND COALESCE(archived,0)=0 ORDER BY name',[p.landlord_id]);
 const override=await queryOne('SELECT so.*,u.name AS approved_by_name FROM property_service_overrides so LEFT JOIN users u ON u.id=so.created_by WHERE so.property_id=$1 AND so.landlord_id=$2 AND so.service_type=$3 AND so.revoked_at IS NULL ORDER BY so.created_at DESC LIMIT 1',[p.id,p.landlord_id,p.service_type]);
 return {property:p,override,bank:bank||{},directors,agreements:(await query('SELECT * FROM landlord_service_agreements WHERE property_id=$1 ORDER BY id DESC',[id])).filter(a=>!a.details?.discarded_draft).map(safe)};
}
export async function serviceAgreementEmail(a:any){
 let html=await fs.readFile(path.join(__dirname,'email-templates',`service-${a.service_type}.html`),'utf8');
 html=html.replace(/src="([^"/]+\.png)"/g,'src="https://crm.fleminglettings.co.uk/email-assets/$1"').split('https://apply.fleminglettings.co.uk/').join(safe(a).signing_url);
 html=html.split('LANDLORD NAME').join(esc(a.details.landlord_name)).split('PROPERTY ADDRESS').join(esc(a.details.property_address));
 html=html.replace(/(?<![0-9])% of first month/g,`${Number(a.setup_fee)}% of first month`).replace(/(?<![0-9])% of (?:monthly )?rent/g,`${Number(a.monthly_fee)}% of rent`);
 return {subject:`${serviceNames[a.service_type]} service agreement - ${a.details.property_address}`,html:prepareEmailHtml(html),to:a.details.landlord_email};
}
export const serviceAgreementSms=(a:any)=>'Hi '+a.details.landlord_name+', please review and sign your '+serviceNames[a.service_type]+' service agreement for '+a.details.property_address+': '+safe(a).signing_url+' Fleming Lettings';
export function registerServiceAgreements(app:Express){
 const publicLimit=rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:true,legacyHeaders:false});
 const resolveLink:RequestHandler=async(req,res,next)=>{
  const value=String(req.params.token||'');
  const parsed=parseServiceSigningSlug(value);
  if(parsed){
   const record=await queryOne('SELECT token FROM landlord_service_agreements WHERE id=$1 AND LEFT(token,32)=$2',[parsed.id,parsed.tokenPrefix]);
   if(!record){res.status(404).json({error:'Agreement not found'});return;}
   req.params.token=record.token;
  }else if(!/^[a-f0-9]{64}$/i.test(value)){res.status(404).json({error:'Agreement not found'});return;}
  next();
 };

 app.get('/api/properties/:id/service-agreements',authMiddleware,requirePermission('staff'),async(req,res)=>{const data=await context(Number(req.params.id));if(!data)return res.sendStatus(404);res.json(data);});
 app.get('/api/landlords/:id/service-agreements',authMiddleware,requirePermission('staff'),async(req,res)=>res.json((await query('SELECT a.*,p.address AS property_address FROM landlord_service_agreements a JOIN properties p ON p.id=a.property_id WHERE a.landlord_id=$1 ORDER BY a.id DESC',[req.params.id])).filter(a=>!a.details?.discarded_draft).map(safe)));
 app.post('/api/properties/:id/service-choice',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const service=String(req.body.service_type||'');
  let fees:ReturnType<typeof propertyServiceFees>;
  try{if(!service)throw Error('Choose a service type');fees=propertyServiceFees(service,req.body.setup_fee,req.body.monthly_fee);}catch(e){return res.status(400).json({error:(e as Error).message});}
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const p=(await c.query('SELECT p.*,l.landlord_type FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE p.id=$1 FOR UPDATE OF p',[req.params.id])).rows[0];
   if(!p||p.landlord_type==='internal'){await c.query('ROLLBACK');return res.status(400).json({error:'Choose a client property'});}
   if(req.body.expected_service_type!==p.service_type){await c.query('ROLLBACK');return res.status(409).json({error:'The service has changed. Reopen the contract and try again.'});}
   const agreements=(await c.query("SELECT * FROM landlord_service_agreements WHERE property_id=$1 AND status<>'void' FOR UPDATE",[p.id])).rows;
   if(agreements.some(a=>a.status==='signed')||p.has_live_tenancy||(await c.query("SELECT id FROM tenants WHERE property_id=$1 AND status IN ('active','scheduled') LIMIT 1",[p.id])).rows.length){await c.query('ROLLBACK');return res.status(409).json({error:'The service cannot be changed here after signing or completing tenant onboarding.'});}
   if((await c.query("SELECT id FROM tenancy_agreements WHERE property_id=$1 AND status IN ('issued','tenant_signed','partially_signed','completed') LIMIT 1",[p.id])).rows.length){await c.query('ROLLBACK');return res.status(409).json({error:'A tenancy agreement has already been issued. Withdraw it before changing the service and payment instructions.'});}
   const before={service_type:p.service_type,setup_fee:p.service_setup_fee,monthly_fee:p.service_monthly_fee};
   const after={service_type:service,setup_fee:fees.service_setup_fee,monthly_fee:fees.service_monthly_fee};
   if(p.service_type===service&&p.service_setup_fee!=null&&p.service_monthly_fee!=null&&Number(p.service_setup_fee)===fees.service_setup_fee&&Number(p.service_monthly_fee)===fees.service_monthly_fee){await c.query('COMMIT');return res.json({success:true,changed:false});}
   const voided=(await c.query("UPDATE landlord_service_agreements SET status='void' WHERE property_id=$1 AND status IN ('draft','issued') RETURNING id",[p.id])).rows.map(a=>a.id);
   await c.query('UPDATE property_service_overrides SET revoked_at=NOW() WHERE property_id=$1 AND revoked_at IS NULL',[p.id]);
   const charge=service==='let_only'?fees.service_setup_fee:fees.service_monthly_fee;
   await c.query('UPDATE properties SET service_type=$2,service_setup_fee=$3,service_monthly_fee=$4,charge_percentage=$5::numeric,total_charge=ROUND((rent_amount*$5::numeric/100)::numeric,2),updated_at=NOW() WHERE id=$1',[p.id,service,fees.service_setup_fee,fees.service_monthly_fee,charge]);
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'service_type_changed','property',$3,$4)",[req.user.id,req.user.email,p.id,JSON.stringify({from:before,to:after,voided_service_agreement_ids:voided,description:'Unsigned contract replaced following service choice change; generate and send a new agreement.'})]);
   await c.query('COMMIT');res.json({success:true,changed:true,voided_agreements:voided});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
 app.post('/api/properties/:id/service-agreements',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const ctx=await context(Number(req.params.id));if(!ctx||ctx.property.landlord_type==='internal')return res.status(400).json({error:'Choose a client property with a linked landlord'});
  const p=ctx.property,d=req.body,service=p.service_type;
  let fees:ReturnType<typeof propertyServiceFees>;
  try{fees=propertyServiceFees(service,d.setup_fee??p.service_setup_fee,d.monthly_fee??p.service_monthly_fee);}catch(e){return res.status(400).json({error:(e as Error).message});}
  const setup=fees.service_setup_fee,monthly=fees.service_monthly_fee;
  const bank={account_name:String(ctx.bank.account_name||''),sort_code:String(ctx.bank.sort_code||''),account_number:String(ctx.bank.account_number||''),bank_name:String(ctx.bank.bank_name||'')};
  // Bank details are proposed values; the landlord must complete and approve them at signing.
  const details={agreement_date:new Date().toISOString().slice(0,10),landlord_name:p.landlord_name,landlord_address:p.home_address||p.landlord_address,landlord_email:p.landlord_email,landlord_phone:p.landlord_phone,entity_type:p.entity_type||'individual',company_number:p.company_number||'',signatory_name:p.entity_type==='company'?String(d.signatory_name||'').trim():'',property_address:normalizePropertyAddress(p.address,p.postcode,p.city),asking_rent:Number(p.rent_amount)};
  if(!details.landlord_address||!details.landlord_phone||!details.asking_rent||!details.landlord_email||!/^\S+@\S+\.\S+$/.test(details.landlord_email)||(p.entity_type==='company'&&(!details.company_number||!details.signatory_name)))return res.status(400).json({error:'Complete the landlord address, email, phone, asking rent and company signatory details first'});
  const a:any={property_id:p.id,landlord_id:p.landlord_id,service_type:service,setup_fee:setup,monthly_fee:monthly,payment_route:service==='let_only'?'landlord':'fleming_client_money',details,bank_details:bank};
  a.details.companySettings=(await getCompanySettings()).data;
  const c=await pool.connect();let file:string|undefined,sourceFile:string|undefined;
  try{await c.query('BEGIN');await c.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE',[p.id]);
   if((await c.query("SELECT id FROM landlord_service_agreements WHERE property_id=$1 AND status<>'void'",[p.id])).rows.length){await c.query('ROLLBACK');return res.status(409).json({error:'Void the current service agreement before creating a replacement'});}
   await c.query('UPDATE properties SET service_setup_fee=$2,service_monthly_fee=$3 WHERE id=$1',[p.id,setup,monthly]);
   const source=await fs.readFile(path.join(__dirname,'agreement-assets',`service-${service}.docx`));const pdf=await servicePdf(a,source);file=`service-${crypto.randomUUID()}.pdf`;sourceFile=file.replace('.pdf','.docx');await fs.mkdir(root(),{recursive:true});await fs.writeFile(path.join(root(),sourceFile),source,{mode:0o600});await fs.writeFile(path.join(root(),file),pdf,{mode:0o600});
   const saved=(await c.query('INSERT INTO landlord_service_agreements(property_id,landlord_id,service_type,setup_fee,monthly_fee,payment_route,token,details,bank_details,filename,created_by,source_filename) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[p.id,p.landlord_id,service,setup,monthly,a.payment_route,crypto.randomBytes(32).toString('hex'),JSON.stringify(details),JSON.stringify(bank),file,req.user.id,sourceFile])).rows[0];await audit(c,req.user,'service_agreement_created',saved);await c.query('COMMIT');res.status(201).json(safe(saved));
  }catch(e){await c.query('ROLLBACK');if(file)await fs.unlink(path.join(root(),file)).catch(()=>{});if(sourceFile)await fs.unlink(path.join(root(),sourceFile)).catch(()=>{});throw e;}finally{c.release();}
 });
 app.post('/api/service-agreements/:id/reset',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const c=await pool.connect();try{await c.query('BEGIN');
   const a=(await c.query('SELECT * FROM landlord_service_agreements WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!a||!['draft','issued'].includes(a.status)||a.signed_at){await c.query('ROLLBACK');return res.status(409).json({error:'Only an unsigned agreement can be edited. Refresh the signing status.'});}
   if((await c.query("SELECT id FROM tenancy_agreements WHERE property_id=$1 AND status IN ('issued','tenant_signed','partially_signed','completed') LIMIT 1",[a.property_id])).rows.length){await c.query('ROLLBACK');return res.status(409).json({error:'A tenancy agreement has already been issued. Review it before resetting the service agreement.'});}
   await c.query("UPDATE landlord_service_agreements SET status='void' WHERE id=$1",[a.id]);
   await c.query('UPDATE property_service_overrides SET revoked_at=NOW() WHERE property_id=$1 AND revoked_at IS NULL',[a.property_id]);
   await audit(c,req.user,'service_agreement_reset',{...a,status:'void'});await c.query('COMMIT');res.json({success:true,property_id:a.property_id});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
 app.post('/api/service-agreements/:id/discard-draft',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{
  const c=await pool.connect();try{await c.query('BEGIN');const a=(await c.query('SELECT * FROM landlord_service_agreements WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!a||a.status!=='draft'||a.issued_at||a.last_sent_at||a.signed_at){await c.query('ROLLBACK');return res.status(409).json({error:'Only an unsent draft can be discarded. Use cancellation for an issued agreement.'});}
   await c.query("UPDATE landlord_service_agreements SET status='void',details=COALESCE(details,'{}'::jsonb)||jsonb_build_object('discarded_draft',true) WHERE id=$1",[a.id]);
   await audit(c,req.user,'service_agreement_draft_discarded',{...a,status:'void'});await c.query('COMMIT');res.json({success:true});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
 app.post('/api/service-agreements/:id/fees',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const c=await pool.connect();let file:string|undefined;
  try{await c.query('BEGIN');const a=(await c.query('SELECT * FROM landlord_service_agreements WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!a||a.status!=='draft'||a.issued_at){await c.query('ROLLBACK');return res.status(409).json({error:'Fees can only be changed before the contract is sent'});}
   let fees:ReturnType<typeof propertyServiceFees>;
   try{fees=propertyServiceFees(a.service_type,req.body.setup_fee,req.body.monthly_fee);}catch(e){await c.query('ROLLBACK');return res.status(400).json({error:(e as Error).message});}
   const p=(await c.query('SELECT landlord_id,service_type FROM properties WHERE id=$1 FOR UPDATE',[a.property_id])).rows[0];
   if(!p||p.landlord_id!==a.landlord_id||p.service_type!==a.service_type){await c.query('ROLLBACK');return res.status(409).json({error:'Property details changed. Create a replacement contract.'});}
   const before={setup_fee:a.setup_fee,monthly_fee:a.monthly_fee};a.setup_fee=fees.service_setup_fee;a.monthly_fee=fees.service_monthly_fee;
   const pdf=await renderStored(a);file=`service-${crypto.randomUUID()}.pdf`;await fs.writeFile(path.join(root(),file),pdf,{mode:0o600});
   await c.query('UPDATE landlord_service_agreements SET setup_fee=$2,monthly_fee=$3,filename=$4 WHERE id=$1',[a.id,a.setup_fee,a.monthly_fee,file]);
   await c.query('UPDATE properties SET service_setup_fee=$2,service_monthly_fee=$3 WHERE id=$1',[a.property_id,a.setup_fee,a.monthly_fee]);
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'service_agreement_fees_updated','property',$3,$4)",[req.user.id,req.user.email,a.property_id,JSON.stringify({service_agreement_id:a.id,from:before,to:{setup_fee:a.setup_fee,monthly_fee:a.monthly_fee}})]);
   await c.query('COMMIT');res.json({success:true});
  }catch(e){await c.query('ROLLBACK');if(file)await fs.unlink(path.join(root(),file)).catch(()=>{});throw e;}finally{c.release();}
 });
 app.get('/api/service-agreements/:id/pdf',authMiddleware,requirePermission('staff'),async(req,res)=>{const a=await queryOne('SELECT * FROM landlord_service_agreements WHERE id=$1',[req.params.id]);if(!a)return res.sendStatus(404);res.type('pdf').set('Cache-Control','no-store').send(await readAgreementPdf(a));});
 app.post('/api/service-agreements/:id/preview',authMiddleware,requirePermission('staff'),async(req,res)=>{const a=await queryOne('SELECT * FROM landlord_service_agreements WHERE id=$1',[req.params.id]);if(!a)return res.sendStatus(404);res.json({...await serviceAgreementEmail(a),sms:serviceAgreementSms(a)});});
 app.post('/api/service-agreements/:id/send',authMiddleware,requirePermission('staff'),async(req:AuthRequest,res)=>{
  const email=req.body.send_email!==false,sms=req.body.send_sms===true;if(!email&&!sms)return res.status(400).json({error:'Choose email or SMS'});
  const c=await pool.connect();let issuedFilename:string|undefined;try{await c.query('BEGIN');const a=(await c.query('SELECT * FROM landlord_service_agreements WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!a||!['draft','issued'].includes(a.status)){await c.query('ROLLBACK');return res.status(409).json({error:'This agreement is no longer awaiting a signature'});}
   if(a.last_sent_at&&Date.now()-new Date(a.last_sent_at).getTime()<60000){await c.query('ROLLBACK');return res.status(429).json({error:'Please wait one minute before resending'});}
   a.issued_at=a.issued_at||new Date().toISOString();
   const currentPresentation=a.details.agent_date_rendered&&a.details.pdf_presentation===SERVICE_PDF_PRESENTATION;
   const issuedFile=currentPresentation?await fs.readFile(path.join(root(),a.filename)):await renderStored(a);
   if(!currentPresentation){issuedFilename=`service-${crypto.randomUUID()}.pdf`;await fs.writeFile(path.join(root(),issuedFilename),issuedFile,{mode:0o600});}
   const results:Array<{success:boolean;simulated?:boolean;error?:string}>=[];
   if(email){const content=await serviceAgreementEmail(a),result=await sendEmail({...content,idempotencyKey:'service-'+a.id+'-'+crypto.randomUUID()});results.push(result);
    await c.query("INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,sent_by,sent_by_email,error_message) VALUES($1,'landlord',$2,$3,$4,$5,'service_agreement',$6,$7,$8,$9,$10)",[result.id||null,a.landlord_id,content.to,OUTBOUND_EMAIL_ADDRESS,content.subject,content.html,result.simulated?'simulated':result.success?'sent':'failed',req.user.id,req.user.email,result.error||null]);}
   if(sms){const message=serviceAgreementSms(a);const phone=normalizeUkPhone(a.details.landlord_phone);const result=await sendSms({to:phone,body:message});results.push(result);
    await c.query("INSERT INTO sms_messages(entity_type,entity_id,to_phone,from_phone,message_body,status,twilio_sid,error_message,sent_by,sent_by_email) VALUES('landlord',$1,$2,$3,$4,$5,$6,$7,$8,$9)",[a.landlord_id,phone,SMS_FROM,message,result.simulated?'simulated':result.success?'sent':'failed',result.sid||null,result.error||null,req.user.id,req.user.email]);}
   const success=results.some(r=>r.success),all=results.every(r=>r.success),simulated=results.filter(r=>r.success).every(r=>r.simulated),deliveryError=results.filter(r=>!r.success).map(r=>r.error).join('; ');
   await c.query("UPDATE landlord_service_agreements SET status=CASE WHEN $2 THEN 'issued' ELSE status END,issued_at=CASE WHEN $2 THEN COALESCE(issued_at,$5::timestamptz) ELSE issued_at END,last_sent_at=NOW(),delivery_status=$3,delivery_error=$4 WHERE id=$1",[a.id,success,success?(simulated?'simulated':all?'sent':'partial'):'failed',deliveryError||null,a.issued_at]);
   if(success){if(issuedFilename){a.filename=issuedFilename;a.details.agent_date_rendered=true;a.details.pdf_presentation=SERVICE_PDF_PRESENTATION;await c.query('UPDATE landlord_service_agreements SET filename=$2,details=$3 WHERE id=$1',[a.id,a.filename,JSON.stringify(a.details)]);}a.status='issued';const file=issuedFile;for(const [type,id] of [['property',a.property_id],['landlord',a.landlord_id]])await c.query("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size) SELECT $1,$2,'Service Agreement (Issued)',$3,$4,'application/pdf',$5 WHERE NOT EXISTS(SELECT 1 FROM documents WHERE entity_type=$1 AND entity_id=$2 AND filename=$3)",[type,id,a.filename,'Service Contract - '+serviceNames[a.service_type]+' - '+a.details.property_address+'.pdf',file.length]);}
   if(!success&&issuedFilename){await fs.unlink(path.join(root(),issuedFilename)).catch(()=>{});issuedFilename=undefined;}
   await audit(c,req.user,success?'service_agreement_sent':'service_agreement_send_failed',a);await c.query('COMMIT');res.status(success?200:502).json({success,simulated:success&&simulated,error:deliveryError||null});
  }catch(e){await c.query('ROLLBACK');if(issuedFilename)await fs.unlink(path.join(root(),issuedFilename)).catch(()=>{});throw e;}finally{c.release();}
 });
 app.post('/api/properties/:id/service-agreement-override',authMiddleware,requirePermission('admin'),async(req:AuthRequest,res)=>{
  if(req.user?.role!=='admin')return res.status(403).json({error:'Administrator access required'});
  const reason=String(req.body.reason||'').trim();if(reason.length<5||reason.length>1000)return res.status(400).json({error:'Enter an override reason (5–1000 characters)'});
  const c=await pool.connect();try{await c.query('BEGIN');const p=(await c.query("SELECT p.* FROM properties p JOIN landlords l ON l.id=p.landlord_id WHERE p.id=$1 AND l.landlord_type<>'internal' FOR UPDATE OF p",[req.params.id])).rows[0];if(!p){await c.query('ROLLBACK');return res.status(404).json({error:'Client property not found'});}
   await c.query('UPDATE property_service_overrides SET revoked_at=NOW() WHERE property_id=$1 AND revoked_at IS NULL',[p.id]);
   await c.query('INSERT INTO property_service_overrides(property_id,landlord_id,service_type,reason,created_by) VALUES($1,$2,$3,$4,$5)',[p.id,p.landlord_id,p.service_type,reason,req.user.id]);
   for(const [type,id]of [['property',p.id],['landlord',p.landlord_id]])await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'service_agreement_override',$3,$4,$5)",[req.user.id,req.user.email,type,id,JSON.stringify({reason,property_id:p.id,service_type:p.service_type,unsigned_agreement:true})]);
   await c.query('COMMIT');res.json({success:true});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
 app.post('/api/service-agreements/:id/void',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{const c=await pool.connect();try{await c.query('BEGIN');const a=(await c.query("UPDATE landlord_service_agreements SET status='void' WHERE id=$1 AND status<>'void' RETURNING *",[req.params.id])).rows[0];if(a)await audit(c,req.user,'service_agreement_voided',a);await c.query('COMMIT');res.json({success:true});}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}});
 app.get('/api/public/service-agreements/:token',publicLimit,resolveLink,async(req,res)=>{const a=await queryOne("UPDATE landlord_service_agreements SET opened_at=NOW() WHERE token=$1 AND status IN ('issued','signed') RETURNING *",[req.params.token]);if(!a)return res.status(404).json({error:'Agreement not found or not yet issued'});res.set('Cache-Control','no-store').json({id:a.id,status:a.status,service_name:serviceNames[a.service_type],service_type:a.service_type,details:a.details,bank_details:a.bank_details,payment_route:a.payment_route,setup_fee:a.setup_fee,monthly_fee:a.monthly_fee,signed_at:a.signed_at});});
 app.get('/api/public/service-agreements/:token/pdf',publicLimit,resolveLink,async(req,res)=>{const a=await queryOne("SELECT * FROM landlord_service_agreements WHERE token=$1 AND status IN ('issued','signed')",[req.params.token]);if(!a)return res.sendStatus(404);res.type('pdf').set('Cache-Control','no-store').send(await readAgreementPdf(a));});
 app.post('/api/public/service-agreements/:token/preview',publicLimit,resolveLink,async(req,res)=>{
  const a=await queryOne("SELECT * FROM landlord_service_agreements WHERE token=$1 AND status='issued'",[req.params.token]);if(!a)return res.status(409).json({error:'Agreement is unavailable for signing'});
  const d=req.body,b=d.bank_details;if(!b||String(b.account_name||'').length>150||String(b.bank_name||'').length>150||String(b.sort_code||'').length>20||String(b.account_number||'').length>20||!String(d.signer_name||'').trim()||String(d.signer_name).length>150||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.signature||'')||d.signature.length>750000)return res.status(400).json({error:'Enter your name and a valid signature'});
  try{await sharp(Buffer.from(d.signature.split(',')[1],'base64'),{limitInputPixels:4000000}).png().toBuffer();}catch{return res.status(400).json({error:'Draw a valid signature'});}
  a.bank_details={account_name:String(b.account_name||'').trim(),bank_name:String(b.bank_name||'').trim(),sort_code:String(b.sort_code||'').replace(/[^0-9]/g,'').replace(/(\d{2})(\d{2})(\d{2})/,'$1-$2-$3'),account_number:String(b.account_number||'')};a.signer_name=String(d.signer_name).trim();a.signature=d.signature;a.signed_at=new Date().toISOString();a.signature_ip=req.ip;
  res.type('pdf').set('Cache-Control','no-store').send(await signedServicePdf(await renderStored(a),a,true));
 });
 app.post('/api/public/service-agreements/:token/sign',publicLimit,resolveLink,async(req,res)=>{
  const d=req.body;if(d.accepted_terms!==true||d.bank_approved!==true||d.start_immediately!==true||!String(d.signer_name||'').trim()||String(d.signer_name).length>150||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.signature||'')||d.signature.length>750000)return res.status(400).json({error:'Sign and accept the terms, immediate commencement and bank details'});
  try{await sharp(Buffer.from(d.signature.split(',')[1],'base64'),{limitInputPixels:4000000}).png().toBuffer();}catch{return res.status(400).json({error:'Draw a valid signature'});}
  const c=await pool.connect();let signedFile:string|undefined,completed:any,completedPdf:Buffer|undefined;
  try{await c.query('BEGIN');const a=(await c.query('SELECT * FROM landlord_service_agreements WHERE token=$1 FOR UPDATE',[req.params.token])).rows[0];if(!a||a.status!=='issued'){await c.query('ROLLBACK');return res.status(409).json({error:'This agreement has already been signed or is unavailable'});}
   const p=(await c.query('SELECT landlord_id,service_type FROM properties WHERE id=$1 FOR UPDATE',[a.property_id])).rows[0];if(p.landlord_id!==a.landlord_id||p.service_type!==a.service_type){await c.query('ROLLBACK');return res.status(409).json({error:'The property details changed. Please ask the office for a replacement agreement.'});}
   const bank={account_name:String(d.bank_details?.account_name||'').trim(),sort_code:String(d.bank_details?.sort_code||'').replace(/[^0-9]/g,''),account_number:String(d.bank_details?.account_number||'').trim(),bank_name:String(d.bank_details?.bank_name||'').trim()};
   if(!bank.account_name||bank.account_name.length>150||!bank.bank_name||bank.bank_name.length>150||!/^\d{6}$/.test(bank.sort_code)||!/^\d{8}$/.test(bank.account_number)){await c.query('ROLLBACK');return res.status(400).json({error:'Enter valid bank details'});}bank.sort_code=bank.sort_code.replace(/(\d{2})(\d{2})(\d{2})/,'$1-$2-$3');
   a.bank_changed=Object.keys(bank).some(k=>String(a.bank_details[k])!==bank[k as keyof typeof bank]);a.bank_details=bank;a.signer_name=String(d.signer_name).trim();a.signature=d.signature;a.signed_at=new Date().toISOString();a.signature_ip=req.ip;a.signature_user_agent=String(req.headers['user-agent']||'').slice(0,500);a.status='signed';a.details.signingConsent=agreementConsentSnapshot('service',d);
   // Re-render Section A with the approved bank account so the contract and certificate agree.
   const signed=await signedServicePdf(await renderStored(a),a);signedFile=`service-signed-${a.id}-${crypto.randomUUID()}.pdf`;await fs.writeFile(path.join(root(),signedFile),signed,{mode:0o600});
   await c.query("UPDATE landlord_service_agreements SET status='signed',bank_details=$2,bank_changed=$3,signer_name=$4,signature=$5,signed_at=$6,signature_ip=$7,signature_user_agent=$8,signed_filename=$9,details=$10 WHERE id=$1",[a.id,JSON.stringify(bank),a.bank_changed,a.signer_name,a.signature,a.signed_at,a.signature_ip,a.signature_user_agent,signedFile,JSON.stringify(a.details)]);
   await c.query('UPDATE properties SET charge_percentage=$2::numeric,total_charge=ROUND((rent_amount*$2::numeric/100)::numeric,2),service_setup_fee=$3,service_monthly_fee=$4,updated_at=NOW() WHERE id=$1',[a.property_id,a.service_type==='let_only'?a.setup_fee:a.monthly_fee,a.setup_fee,a.monthly_fee]);
   await c.query('SELECT id FROM landlords WHERE id=$1 FOR UPDATE',[a.landlord_id]);
   const master=(await c.query('SELECT * FROM landlord_bank_details WHERE landlord_id=$1 FOR UPDATE',[a.landlord_id])).rows[0];
   const masterChanged=!master||Object.keys(bank).some(k=>String(master[k]||'')!==bank[k as keyof typeof bank]);
   await c.query(`INSERT INTO landlord_bank_details(landlord_id,account_name,sort_code,account_number,bank_name,landlord_approved_at,landlord_approved_name)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(landlord_id) DO UPDATE SET account_name=$2,sort_code=$3,account_number=$4,bank_name=$5,
    landlord_approved_at=$6,landlord_approved_name=$7,approved_at=CASE WHEN $8 THEN NULL ELSE landlord_bank_details.approved_at END,
    approved_by=CASE WHEN $8 THEN NULL ELSE landlord_bank_details.approved_by END,updated_at=NOW()`,
    [a.landlord_id,bank.account_name,bank.sort_code,bank.account_number,bank.bank_name,a.signed_at,a.signer_name,masterChanged]);
   await syncLandlordBankApprovalTask(c,a.landlord_id);
   const masked=(value:any)=>value?{account_name:value.account_name,bank_name:value.bank_name,sort_code:'**-**-'+String(value.sort_code).slice(-2),account_number:'****'+String(value.account_number).slice(-4)}:null;
   const bankAudit=JSON.stringify({confirmed_by:a.signer_name,confirmed_at:a.signed_at,service_agreement_id:a.id,property_address:a.details.property_address,source:'Landlord service agreement signing',bank_details:{from:masked(master),to:masked(bank)}});
   for(const [type,id] of [['landlord',a.landlord_id],['property',a.property_id]])await c.query("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes,ip_address) VALUES($1,$2,$3,$4,$5,$6)",
    [a.signer_name+' (landlord signatory)',masterChanged?'bank_details_updated':'bank_details_confirmed',type,id,bankAudit,req.ip]);
   const name=`Service Contract - ${serviceNames[a.service_type]} - ${a.details.property_address}.pdf`;
   for(const [type,id] of [['property',a.property_id],['landlord',a.landlord_id]])await c.query("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size) VALUES($1,$2,'service_agreement',$3,$4,'application/pdf',$5)",[type,id,signedFile,name,signed.length]);
   await audit(c,null,'service_agreement_signed',a);await c.query('COMMIT');completed=a;completedPdf=signed;
  }catch(e){await c.query('ROLLBACK');if(signedFile)await fs.unlink(path.join(root(),signedFile)).catch(()=>{});throw e;}finally{c.release();}
  if(completed&&completedPdf){try{const content=completedLandlordAgreementEmail(completed.details.landlord_name,completed.details.property_address,serviceNames[completed.service_type],completed.signed_at);const result=await sendEmail({...content,to:completed.details.landlord_email,idempotencyKey:'completed-service-'+completed.id,attachments:[{filename:'Signed Service Agreement - '+serviceNames[completed.service_type]+'.pdf',content:completedPdf,contentType:'application/pdf'}]});
   await run("INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,error_message) VALUES($1,'landlord',$2,$3,$4,$5,'completed_service_agreement',$6,$7,$8)",[result.id||null,completed.landlord_id,completed.details.landlord_email,OUTBOUND_EMAIL_ADDRESS,content.subject,content.html,result.simulated?'simulated':result.success?'sent':'failed',result.error||null]);
  }catch(e){console.error('Completed service agreement email failed',e);}}
  res.json({success:true,signed_at:completed.signed_at});
 });
}
