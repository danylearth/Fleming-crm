import {publishAppInventory} from './inventory-pdf';
import type { Express, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import rateLimit from 'express-rate-limit';
import pool, {query,queryOne,run} from './db-pg';
import {authMiddleware, requirePermission, AuthRequest} from './auth';
import {sendEmail,propertyInventoryEmail,OUTBOUND_EMAIL_ADDRESS} from './email';
import {sendSms,normalizeUkPhone,SMS_FROM} from './sms';
export const inventoryDisclaimer = 'Where no comments are received by the date above, the inventory is taken as agreed as it stands. Please get in touch if you need more time or would like to talk anything through.';
const filesRoot=path.join(process.env.UPLOADS_PATH || path.join(__dirname,'../uploads'),'inventory');
function sendStoredInventory(res:Response,filename:string) {
  const root=path.resolve(path.dirname(filesRoot));
  const file=path.resolve(root,filename);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.sendStatus(404);
  return res.type('pdf').sendFile(file);
}
const publicLimiter=rateLimit({windowMs:15*60*1000,max:500,standardHeaders:true,legacyHeaders:false});
const writeLimiter=rateLimit({windowMs:15*60*1000,max:180,standardHeaders:true,legacyHeaders:false});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:100*1024*1024,files:1}}).single('file');
const publicPhoto=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}}).single('file');
const dateText=(value:any)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
export async function inventoryEditable(req:AuthRequest,res:Response,next:NextFunction) {
  const id=req.params.inventoryId || req.params.id;
  let record;
  if(req.path.startsWith('/api/inventory-rooms/')) record=await queryOne('SELECT i.* FROM inventories i JOIN inventory_rooms r ON r.inventory_id=i.id WHERE r.id=$1',[id]);
  else if(req.path.startsWith('/api/inventory-photos/') && !req.params.inventoryId) record=await queryOne('SELECT i.* FROM inventories i JOIN inventory_photos p ON p.inventory_id=i.id WHERE p.id=$1',[id]);
  else record=await queryOne('SELECT * FROM inventories WHERE id=$1',[id]);
  if(!record) return res.status(404).json({error:'Inventory not found'});
  if((record.signed_date||record.signed_document) && req.user?.role!=='admin') return res.status(403).json({error:'Only administrators can change a completed, signed inventory'});
  if(record.review_issued_at) return res.status(409).json({error:'This inventory has been issued for review and is locked. Create a new inventory for further changes.'});
  next();
}

export async function issueInventory(id:number,due?:string) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const inventory=(await client.query('SELECT i.*,t.name,t.email,t.phone,t.linked_tenant_id,t.tenancy_start_date,p.address,p.postcode FROM inventories i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=i.property_id WHERE i.id=$1 FOR UPDATE OF i',[id])).rows[0];
    if(!inventory) throw new Error('Choose a tenant for this inventory before sending it');
    if(!inventory.review_issued_at) {
      const content=(await client.query('SELECT (SELECT COUNT(*) FROM inventory_photos WHERE inventory_id=$1)+(SELECT COUNT(*) FROM inventory_documents WHERE inventory_id=$1) AS count',[id])).rows[0];
      if(!Number(content.count)) throw new Error('Add inventory photos or a completed PDF before sending it');
      const tenants=(await client.query('SELECT id,name,email,phone FROM tenants WHERE property_id=$1 AND (id=$2 OR (id=$3 AND tenancy_start_date IS NOT DISTINCT FROM $4))',[inventory.property_id,inventory.tenant_id,inventory.linked_tenant_id,inventory.tenancy_start_date])).rows;
      if(!tenants.some(t=>t.email || t.phone)) throw new Error('Add tenant contact details before sending the inventory');
      const deadline=due || new Date(Math.max(Date.now(),new Date(inventory.tenancy_start_date || Date.now()).getTime())+7*86400000).toISOString().slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(Date.parse(deadline)) || deadline<new Date().toISOString().slice(0,10)) throw new Error('Choose a review deadline today or later');
      for(const t of tenants) await client.query('INSERT INTO inventory_reviews (inventory_id,tenant_id,token,tenant_name,email,phone,due_date,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7::date+INTERVAL \'90 days\')',[id,t.id,crypto.randomBytes(32).toString('hex'),t.name,t.email,t.phone,deadline]);
      await client.query("UPDATE inventories SET status='completed',completed_at=COALESCE(completed_at,NOW()),review_issued_at=NOW() WHERE id=$1",[id]);
    }
    await publishAppInventory(client,id);
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();}
  return deliverInventory(id);
}
async function deliverInventory(id:number) {
  const rows=await query('SELECT r.*,p.address FROM inventory_reviews r JOIN inventories i ON i.id=r.inventory_id JOIN properties p ON p.id=i.property_id WHERE inventory_id=$1 ORDER BY r.id',[id]);
  const results=[];
  for(const r of rows) {
    // A crash after dispatch leaves the claim for manual reconciliation, avoiding duplicate texts.
    const claimed=await queryOne('UPDATE inventory_reviews SET sending_at=NOW() WHERE id=$1 AND sending_at IS NULL RETURNING id',[r.id]);
    if(!claimed){results.push({tenant:r.tenant_name,email:r.email_id?'sent':r.email_error || 'Check delivery status',sms:r.sms_id?'sent':r.sms_error || 'Check delivery status'});continue;}
    const link=`https://apply.fleminglettings.co.uk/inventory/${r.token}`;
    const html=propertyInventoryEmail(r.tenant_name,r.address,dateText(r.due_date),link);
    let emailResult:any={success:!!r.email_id,id:r.email_id,error:r.email?'':'No email address recorded'};
    let smsResult:any={success:!!r.sms_id,sid:r.sms_id,error:r.phone?'':'No phone number recorded'};
    if(r.email && !r.email_id) {
      emailResult=await sendEmail({to:r.email,subject:'Your property inventory is ready to review',html,idempotencyKey:`inventory-review-${r.id}`});
      await run(`INSERT INTO email_messages (resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,error_message) VALUES ($1,'tenant',$2,$3,$4,$5,'property_inventory',$6,$7,$8)`,[emailResult.id||null,r.tenant_id,r.email,OUTBOUND_EMAIL_ADDRESS,'Your property inventory is ready to review',html,emailResult.success?'sent':'failed',emailResult.error||null]);
    }
    if(r.phone && !r.sms_id) {
      const body=`Hi ${r.tenant_name.split(' ')[0]}, your property inventory checklist has now been completed and is ready for you to review, comment and sign. Please click here to begin: ${link}`;
      smsResult=await sendSms({to:normalizeUkPhone(r.phone),body});
      await run(`INSERT INTO sms_messages (entity_type,entity_id,to_phone,from_phone,message_body,status,twilio_sid,error_message) VALUES ('tenant',$1,$2,$3,$4,$5,$6,$7)`,[r.tenant_id,r.phone,SMS_FROM,body,smsResult.success?'sent':'failed',smsResult.sid||null,smsResult.error||null]);
    }
    await run('UPDATE inventory_reviews SET email_id=$1,email_error=$2,sms_id=$3,sms_error=$4 WHERE id=$5',[emailResult.id||null,emailResult.error||null,smsResult.sid||null,smsResult.error||null,r.id]);
    results.push({tenant:r.tenant_name,email:emailResult.success?'sent':emailResult.error,sms:smsResult.success?'sent':smsResult.error});
  }
  return results;
}
async function publicReview(req:any,res:Response,next:NextFunction) {
  const token=req.params.token;
  if(!/^[a-f0-9]{64}$/.test(token)) return res.status(404).json({error:'Inventory link not found'});
  const review=await queryOne('SELECT * FROM inventory_reviews WHERE token=$1 AND expires_at>NOW()',[token]);
  if(!review)return res.status(404).json({error:'This inventory link is unavailable or expired. Please contact the office'});
  if(req.method!=='GET' && review.signed_at)return res.status(409).json({error:'Your signed review is saved. Contact the office to add further comments'});
  res.locals.review=review; res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();
}
export function registerInventoryReviewRoutes(app:Express) {
  app.get('/api/properties/:id/inventory-records',authMiddleware,async(req,res)=>res.json(await query(`SELECT i.*,COALESCE(i.signed_date,(SELECT MAX(r.signed_at)::date FROM inventory_reviews r WHERE r.inventory_id=i.id HAVING COUNT(*)=COUNT(r.signed_at))) AS signed_date,COALESCE(d.filename,(SELECT original_name FROM documents WHERE inventory_id=i.id LIMIT 1)) AS filename, (SELECT json_agg(json_build_object('id',r.id,'review_url','https://apply.fleminglettings.co.uk/inventory/' || r.token,'name',r.tenant_name,'signed_at',r.signed_at,'due_date',r.due_date,'email_id',r.email_id,'email_error',r.email_error,'sms_id',r.sms_id,'sms_error',r.sms_error)) FROM inventory_reviews r WHERE r.inventory_id=i.id) AS reviews FROM inventories i LEFT JOIN inventory_documents d ON d.inventory_id=i.id WHERE i.property_id=$1 ORDER BY inspection_date DESC`,[req.params.id])));
  app.get('/api/inventories/:id/reviews/:reviewId',authMiddleware,async(req,res)=>{
    const review=await queryOne('SELECT id,tenant_name,due_date,signed_at,signature_name,general_comments FROM inventory_reviews WHERE id=$1 AND inventory_id=$2',[req.params.reviewId,req.params.id]);
    if(!review)return res.sendStatus(404);
    const photos=await query('SELECT p.id,p.caption,rm.room_name,pr.approved,pr.comment FROM inventory_photos p LEFT JOIN inventory_rooms rm ON rm.id=p.room_id LEFT JOIN inventory_photo_reviews pr ON pr.photo_id=p.id AND pr.review_id=$2 WHERE p.inventory_id=$1 ORDER BY p.room_id,p.photo_order,p.id',[req.params.id,review.id]);
    const added_photos=await query('SELECT id,caption FROM inventory_tenant_photos WHERE review_id=$1 ORDER BY id',[review.id]);
    res.json({...review,photos,added_photos});
  });
  app.get('/api/inventories/:id/reviews/:reviewId/photos/:photoId',authMiddleware,async(req,res)=>{
    const row=await queryOne('SELECT p.data FROM inventory_tenant_photos p JOIN inventory_reviews r ON r.id=p.review_id WHERE p.id=$1 AND r.id=$2 AND r.inventory_id=$3',[req.params.photoId,req.params.reviewId,req.params.id]);
    if(!row)return res.sendStatus(404);res.type('jpg').send(row.data);
  });
  app.post('/api/properties/:id/inventory-document',authMiddleware,requirePermission('staff'),(req:AuthRequest,res)=>upload(req,res,async(error)=>{
    if(error || !req.file)return res.status(400).json({error:'Choose one signed PDF up to 100 MB'});
    if(!req.file.buffer.subarray(0,5).equals(Buffer.from('%PDF-')))return res.status(400).json({error:'Upload a completed inventory as a PDF'});
    const {tenant_id,inspection_date,signed_date,inventory_id}=req.body;
    const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v||'') && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
    if((!signed_date&&req.body.signature_date_unknown!=='true')||!valid(inspection_date)||(signed_date&&(!valid(signed_date)||signed_date<inspection_date||signed_date>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date()))))return res.status(400).json({error:'Choose a valid completion date. If recorded, signing must be on or after completion and no later than today'});
    const tenant=await queryOne('SELECT id,linked_tenant_id,tenancy_start_date FROM tenants WHERE id=$1 AND property_id=$2',[Number(tenant_id)||0,req.params.id]);
    if(!tenant)return res.status(400).json({error:'Choose a tenant linked to this property'});
    const joint=await queryOne('SELECT id FROM tenants WHERE id=$1 AND property_id=$2 AND tenancy_start_date IS NOT DISTINCT FROM $3',[tenant.linked_tenant_id,req.params.id,tenant.tenancy_start_date]);
    const tenancyIds=joint?[tenant.id,joint.id].sort((a,b)=>a-b):[tenant.id];
    const c=await pool.connect();let filename:string|undefined;
    try {
      await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(917,$1::int)',[tenancyIds[0]]);
      const existing=(await c.query('SELECT * FROM inventories WHERE property_id=$1 AND tenant_id=ANY($2::int[]) AND (signed_date IS NOT NULL OR signed_document) ORDER BY id FOR UPDATE',[req.params.id,tenancyIds])).rows[0];
      if(existing && (!inventory_id || Number(inventory_id)!==existing.id)){await c.query('ROLLBACK');return res.status(409).json({error:'This tenancy already has a signed inventory. An administrator can edit the existing record'});}
      if(inventory_id && (!existing||req.user.role!=='admin')){await c.query('ROLLBACK');return res.status(403).json({error:'Only administrators can edit a completed inventory'});}
      if(existing?.review_issued_at){await c.query('ROLLBACK');return res.status(409).json({error:'Issued tenant reviews retain their original evidence'});}
      const row=existing || (await c.query("INSERT INTO inventories(property_id,tenant_id,inventory_type,inspection_date,conducted_by,status,completed_at,signed_document,signed_date) VALUES($1,$2,'check_in',$3,$4,'completed',NOW(),true,$5) RETURNING id",[req.params.id,tenant_id,inspection_date,req.user.id,signed_date||null])).rows[0];
      if(existing)await c.query('UPDATE inventories SET inspection_date=$1,signed_date=$2,signed_document=true WHERE id=$3',[inspection_date,signed_date||null,row.id]);
      await c.query('INSERT INTO inventory_documents(inventory_id,filename,data) VALUES($1,$2,$3) ON CONFLICT(inventory_id) DO UPDATE SET filename=EXCLUDED.filename,data=EXCLUDED.data',[row.id,path.basename(req.file.originalname),req.file.buffer]);
      fs.mkdirSync(filesRoot,{recursive:true});filename='inventory/'+crypto.randomUUID()+'.pdf';fs.writeFileSync(path.join(filesRoot,path.basename(filename)),req.file.buffer,{mode:0o600});
      const entities=[{type:'property',id:Number(req.params.id)},{type:'tenant',id:tenant.id}];
      const partner=(await c.query('SELECT id FROM tenants WHERE id=$1 AND property_id=$2 AND tenancy_start_date IS NOT DISTINCT FROM $3',[tenant.linked_tenant_id,req.params.id,tenant.tenancy_start_date])).rows[0];if(partner)entities.push({type:'tenant',id:partner.id});
      // Adopt an identical legacy Documents upload into the shared inventory instead of listing it twice.
      const digest=crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      for(const entity of entities){
        const candidates=(await c.query("SELECT id,filename FROM documents WHERE entity_type=$1 AND entity_id=$2 AND doc_type='Inventory' AND inventory_id IS NULL AND size=$3 FOR UPDATE",[entity.type,entity.id,req.file.size])).rows;
        for(const d of candidates){const file=path.resolve(path.dirname(filesRoot),d.filename);if(file.startsWith(path.dirname(filesRoot)+path.sep)&&fs.existsSync(file)&&crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===digest){await c.query('UPDATE documents SET inventory_id=$1 WHERE id=$2',[row.id,d.id]);break;}}
      }
      for(const entity of entities)await c.query("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,uploaded_by,review_status,inventory_id) VALUES($1,$2,'Inventory',$3,$4,'application/pdf',$5,$6,'approved',$7) ON CONFLICT(inventory_id,entity_type,entity_id) WHERE inventory_id IS NOT NULL DO UPDATE SET filename=EXCLUDED.filename,original_name=EXCLUDED.original_name,size=EXCLUDED.size,uploaded_at=NOW()",[entity.type,entity.id,filename,path.basename(req.file.originalname),req.file.size,req.user.id,row.id]);
      await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,'inventory',$4,$5)",[req.user.id,req.user.email,existing?'update':'create',row.id,JSON.stringify({source:'signed_pdf',tenant_id:Number(tenant_id),inspection_date,signed_date,previous:existing||null})]);
      await c.query('COMMIT');res.json(row);
    }catch{await c.query('ROLLBACK');if(filename)fs.rmSync(path.join(filesRoot,path.basename(filename)),{force:true});res.status(500).json({error:'Inventory could not be saved'});}finally{c.release();}
  }));
  app.post('/api/inventories/:id/review',authMiddleware,async(req,res)=>{try{res.json({success:true,delivery:await issueInventory(Number(req.params.id),req.body.due_date)});}catch(error){res.status(400).json({error:error instanceof Error?error.message:'Inventory could not be sent'});}});
  app.get('/api/inventories/:id/document',authMiddleware,async(req,res)=>{const d=await queryOne('SELECT * FROM inventory_documents WHERE inventory_id=$1',[req.params.id]);if(!d){const generated=await queryOne('SELECT filename FROM documents WHERE inventory_id=$1 LIMIT 1',[req.params.id]);if(generated)return sendStoredInventory(res,generated.filename);return res.sendStatus(404);}res.type('pdf').setHeader('Content-Disposition','attachment; filename="inventory.pdf"');res.send(d.data);});
  app.get('/api/public/inventory/:token',publicLimiter,publicReview,async(req,res)=>{
    const r=res.locals.review;
    const inventory=await queryOne('SELECT i.id,i.inspection_date,i.inventory_type,i.notes,p.address,p.postcode FROM inventories i JOIN properties p ON p.id=i.property_id WHERE i.id=$1',[r.inventory_id]);
    const photos=await query('SELECT p.id,p.caption,rm.room_name,pr.approved,pr.comment FROM inventory_photos p LEFT JOIN inventory_rooms rm ON rm.id=p.room_id LEFT JOIN inventory_photo_reviews pr ON pr.photo_id=p.id AND pr.review_id=$2 WHERE p.inventory_id=$1 ORDER BY p.room_id,p.photo_order,p.id',[r.inventory_id,r.id]);
    const own_photos=await query('SELECT id,caption FROM inventory_tenant_photos WHERE review_id=$1 ORDER BY id',[r.id]);
    res.json({inventory,photos,own_photos,has_document:!!await queryOne('SELECT inventory_id FROM inventory_documents WHERE inventory_id=$1 UNION ALL SELECT inventory_id FROM documents WHERE inventory_id=$1 LIMIT 1',[r.inventory_id]),name:r.tenant_name,due_date:dateText(r.due_date),signed_at:r.signed_at,general_comments:r.general_comments,disclaimer:inventoryDisclaimer});
  });
  app.get('/api/public/inventory/:token/document',publicLimiter,publicReview,async(req,res)=>{const d=await queryOne('SELECT data FROM inventory_documents WHERE inventory_id=$1',[res.locals.review.inventory_id]);if(!d){const generated=await queryOne('SELECT filename FROM documents WHERE inventory_id=$1 LIMIT 1',[res.locals.review.inventory_id]);if(generated)return sendStoredInventory(res,generated.filename);return res.sendStatus(404);}res.type('pdf').setHeader('Content-Disposition','attachment; filename="inventory.pdf"');res.send(d.data);});
  app.get('/api/public/inventory/:token/photos/:photoId',publicLimiter,publicReview,async(req,res)=>{
    const photo=await queryOne('SELECT filename FROM inventory_photos WHERE id=$1 AND inventory_id=$2',[Number(req.params.photoId)||0,res.locals.review.inventory_id]);if(!photo)return res.sendStatus(404);
    res.sendFile(path.join(filesRoot,path.basename(photo.filename)));
  });
  app.put('/api/public/inventory/:token/photos/:photoId',writeLimiter,publicReview,async(req,res)=>{
    const r=res.locals.review,{approved,comment=''}=req.body;
    if(typeof approved!=='boolean'||typeof comment!=='string'||comment.length>4000)return res.status(400).json({error:'Add a comment up to 4,000 characters'});
    const c=await pool.connect();try{await c.query('BEGIN');const locked=(await c.query('SELECT signed_at FROM inventory_reviews WHERE id=$1 FOR UPDATE',[r.id])).rows[0];if(locked.signed_at)throw new Error('Your review has already been signed');
      if(!(await c.query('SELECT id FROM inventory_photos WHERE id=$1 AND inventory_id=$2',[Number(req.params.photoId)||0,r.inventory_id])).rowCount)throw new Error('Photo not found');
      await c.query('INSERT INTO inventory_photo_reviews(review_id,photo_id,approved,comment) VALUES($1,$2,$3,$4) ON CONFLICT(review_id,photo_id) DO UPDATE SET approved=$3,comment=$4,updated_at=NOW()',[r.id,req.params.photoId,approved,comment]);await c.query('COMMIT');res.json({success:true});
    }catch(e){await c.query('ROLLBACK');res.status(400).json({error:e.message});}finally{c.release();}
  });
  app.post('/api/public/inventory/:token/photos',writeLimiter,publicReview,(req,res)=>publicPhoto(req,res,async(error)=>{
    if(error||!req.file)return res.status(400).json({error:'Choose an image up to 10 MB'});
    const r=res.locals.review;const caption=String(req.body.caption||'').trim();if(!caption||caption.length>4000)return res.status(400).json({error:'Describe the discrepancy or missing item'});
    let data:Buffer;try{data=await sharp(req.file.buffer,{limitInputPixels:40000000}).rotate().resize(2000,2000,{fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();}catch{return res.status(400).json({error:'Choose a readable image'});}
    const c=await pool.connect();try{await c.query('BEGIN');const locked=(await c.query('SELECT signed_at FROM inventory_reviews WHERE id=$1 FOR UPDATE',[r.id])).rows[0];if(locked.signed_at)throw new Error('Your review has already been signed');const count=(await c.query('SELECT COUNT(*) FROM inventory_tenant_photos WHERE review_id=$1',[r.id])).rows[0];if(Number(count.count)>=100)throw new Error('Maximum 100 additional photos');const row=(await c.query('INSERT INTO inventory_tenant_photos(review_id,caption,data) VALUES($1,$2,$3) RETURNING id,caption',[r.id,caption,data])).rows[0];await c.query('COMMIT');res.json(row);}catch(e){await c.query('ROLLBACK');res.status(400).json({error:e.message});}finally{c.release();}
  }));
  app.get('/api/public/inventory/:token/own-photos/:photoId',publicLimiter,publicReview,async(req,res)=>{const row=await queryOne('SELECT data FROM inventory_tenant_photos WHERE id=$1 AND review_id=$2',[Number(req.params.photoId)||0,res.locals.review.id]);if(!row)return res.sendStatus(404);res.type('jpg').send(row.data);});
  app.post('/api/public/inventory/:token/sign',writeLimiter,publicReview,async(req,res)=>{
    const r=res.locals.review,{signature_name,general_comments='',confirmed}=req.body;
    if(typeof signature_name!=='string'||signature_name.trim().length<2||signature_name.length>200||confirmed!==true||typeof general_comments!=='string'||general_comments.length>12000)return res.status(400).json({error:'Enter your full name and confirm your review'});
    const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM inventories WHERE id=$1 FOR UPDATE',[r.inventory_id]);const locked=(await c.query('SELECT signed_at FROM inventory_reviews WHERE id=$1 FOR UPDATE',[r.id])).rows[0];if(locked.signed_at)throw new Error('Your review has already been signed');
      const remaining=(await c.query("SELECT COUNT(*) FROM inventory_photos p LEFT JOIN inventory_photo_reviews pr ON pr.photo_id=p.id AND pr.review_id=$2 WHERE p.inventory_id=$1 AND (pr.photo_id IS NULL OR (NOT pr.approved AND trim(pr.comment)=''))",[r.inventory_id,r.id])).rows[0];if(Number(remaining.count))throw new Error(`Review the remaining ${remaining.count} photos before signing`);
      await c.query('UPDATE inventory_reviews SET signature_name=$1,general_comments=$2,signed_at=NOW() WHERE id=$3',[signature_name.trim(),general_comments,r.id]);await c.query("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES($1,'signed','inventory',$2,$3)",[r.email||'tenant-inventory-review',r.inventory_id,JSON.stringify({review_id:r.id,signature_name:signature_name.trim(),disclaimer:inventoryDisclaimer})]);await publishAppInventory(c,r.inventory_id,true);await c.query('COMMIT');res.json({success:true});
    }catch(e){await c.query('ROLLBACK');res.status(400).json({error:e.message});}finally{c.release();}
  });
}
