import type {PoolClient} from 'pg';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {executionHash} from './guarantor-execution-rules';

export const guarantorEvidenceCategories=['Primary Identification','Secondary Identification','Bank Statements','Proof of Income or Employment','Employment Reference'];
export const guarantorCreditCategory='Credit Check Report';

export async function validateGuarantorEvidence(bytes:Buffer){
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>10*1024*1024)throw Error('Choose a document no larger than 10 MB');
 if(bytes.subarray(0,5).toString()==='%PDF-'){
  const pdf=await PDFDocument.load(bytes);if(!pdf.getPageCount()||pdf.getPageCount()>100)throw Error('Use a PDF with between 1 and 100 pages');
  return {mime:'application/pdf',extension:'.pdf'};
 }
 const image=await sharp(bytes,{limitInputPixels:40000000}).metadata();
 if(!['png','jpeg'].includes(image.format)||!image.width||!image.height)throw Error('Use a PDF, PNG or JPEG document');
 return {mime:image.format==='png'?'image/png':'image/jpeg',extension:image.format==='png'?'.png':'.jpg'};
}

export function assertGuarantorEvidenceEditable(g:any,category:string,files:any[],office=false){
 if(category===guarantorCreditCategory){
  if(!office||g.workflow?.reviewStatus!=='approved'||g.status==='verified')throw Error('Approve the application before recording the guarantor credit check');
  return;
 }
 if(!guarantorEvidenceCategories.includes(category))throw Error('Choose a permitted evidence category');
 if(!['invited','changes_requested'].includes(g.status))throw Error('Submitted evidence is locked');
 if(g.signature){
  const current=files.find(file=>file.category===category),index=guarantorEvidenceCategories.indexOf(category);
  if(g.workflow?.reviewStatus!=='changes_requested'||!g.workflow?.changesSent||(current?.review_status!=='rejected'&&!(index<4&&!current)))throw Error('Only documents requested by the office can be replaced');
 }
}

// The caller holds the verification row lock and owns the transaction. The
// immutable filename keeps earlier evidence available to the office audit.
export async function storeGuarantorEvidence(client:PoolClient,g:any,category:string,file:Express.Multer.File,uploadsDir:string){
 if(!file)throw Error('Choose a document');
 const type=await validateGuarantorEvidence(file.buffer);
 const filename='guarantor-'+crypto.randomUUID()+type.extension,location=path.resolve(uploadsDir,filename);
 const originalName=path.basename(String(file.originalname).replace(/\\/g,'/')).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200)||'Supporting document'+type.extension;
 await fs.mkdir(uploadsDir,{recursive:true});await fs.writeFile(location,file.buffer,{flag:'wx'});
 try{
  await client.query('UPDATE guarantor_verification_files SET current=FALSE WHERE verification_id=$1 AND category=$2',[g.id,category]);
  const row=(await client.query('INSERT INTO guarantor_verification_files(verification_id,category,filename,original_name,mime_type,sha256,size) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[g.id,category,filename,originalName,type.mime,executionHash(file.buffer),file.buffer.length])).rows[0];
  return {id:row.id,location};
 }catch(error){await fs.unlink(location).catch(()=>{});throw error;}
}

export function guarantorEvidencePath(uploadsDir:string,filename:string){
 if(!/^guarantor-[a-f0-9-]+\.(pdf|png|jpg)$/.test(filename))throw Error('The supporting document is unavailable');
 return path.resolve(uploadsDir,filename);
}
