import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pool from './db-pg';
export async function storeUniqueDocument({entityType,entityId,docType,applicantNumber,file,userId,uploadsDir}:{entityType:string;entityId:number;docType:string;applicantNumber:number;file:Express.Multer.File;userId:number;uploadsDir:string}) {
 const hash=(buffer:Buffer)=>crypto.createHash('sha256').update(buffer).digest('hex');
 const digest=hash(fs.readFileSync(path.join(uploadsDir,file.filename)));
 const client=await pool.connect();
 try {
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`document:${entityType}:${entityId}:${applicantNumber}`]);
  const candidates=(await client.query('SELECT * FROM documents WHERE entity_type=$1 AND entity_id=$2 AND COALESCE(applicant_number,1)=$3 AND size=$4',[entityType,entityId,applicantNumber,file.size])).rows;
  for(const doc of candidates){const stored=path.join(uploadsDir,doc.filename);if(fs.existsSync(stored)&&hash(fs.readFileSync(stored))===digest){await client.query('COMMIT');fs.rmSync(path.join(uploadsDir,file.filename),{force:true});return {...doc,duplicate:true};}}
  const doc=(await client.query("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,uploaded_by,applicant_number,review_status,reviewed_at,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved',NOW(),$8) RETURNING *",[entityType,entityId,docType,file.filename,file.originalname,file.mimetype,file.size,userId,applicantNumber])).rows[0];
  await client.query('COMMIT');return doc;
 }catch(error){await client.query('ROLLBACK');fs.rmSync(path.join(uploadsDir,file.filename),{force:true});throw error;}finally{client.release();}
}
