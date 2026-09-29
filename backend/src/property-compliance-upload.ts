import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from './db-pg';
import type {PoolClient} from 'pg';

const expiryFields:Record<string,string>={EPC:'epc_expiry_date',EICR:'eicr_expiry_date','Gas Safety Certificate':'gas_safety_expiry_date'};
const documentTypes=[...Object.keys(expiryFields),'How to Rent Guide','Renters Rights Information'];
export class ComplianceUploadError extends Error { constructor(message:string,public status=400){super(message);} }

export async function savePropertyCompliance({propertyId,docType,expiryDate,file,user,uploadsDir,enquiryId}:{propertyId:number;docType:string;expiryDate:string;file?:Express.Multer.File;user:{id:number;email:string};uploadsDir:string;enquiryId?:number}){
 const incoming=file?path.join(uploadsDir,file.filename):null;
 let committed=false,retained=false;
 let client:PoolClient|undefined;
 try{
  if(!Number.isSafeInteger(propertyId)||propertyId<1)throw new ComplianceUploadError('Choose a valid property');
  if(!documentTypes.includes(docType))throw new ComplianceUploadError('Choose a supported property compliance document');
  const expiryField=expiryFields[docType];
  if(expiryField&&(!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)||!Number.isFinite(Date.parse(expiryDate))||new Date(expiryDate).toISOString().slice(0,10)!==expiryDate))throw new ComplianceUploadError('Enter a valid expiry date');
  if(file&&!['application/pdf','image/jpeg','image/png'].includes(file.mimetype))throw new ComplianceUploadError('Choose a PDF, JPG or PNG document');
  client=await pool.connect();await client.query('BEGIN');
  const property=(await client.query('SELECT * FROM properties WHERE id=$1 FOR UPDATE',[propertyId])).rows[0];
  if(!property)throw new ComplianceUploadError('Property not found',404);
  if(enquiryId!==undefined&&(!Number.isSafeInteger(enquiryId)||enquiryId<1||!(await client.query('SELECT id FROM tenant_enquiries WHERE id=$1 AND linked_property_id=$2',[enquiryId,propertyId])).rows.length))throw new ComplianceUploadError('The onboarding enquiry is not linked to this property',409);
  const existing=(await client.query("SELECT * FROM documents WHERE entity_type='property' AND entity_id=$1 AND doc_type=$2 AND COALESCE(review_status,'approved')='approved' ORDER BY uploaded_at DESC,id DESC LIMIT 1",[propertyId,docType])).rows[0];
  const existingPath=existing?path.join(uploadsDir,existing.filename):null;
  const existingAvailable=Boolean(existingPath&&fs.existsSync(existingPath));
  if(!file&&!existingAvailable)throw new ComplianceUploadError('Choose a document to upload');
  const hash=(filename:string)=>crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  const duplicate=Boolean(incoming&&existingAvailable&&hash(incoming)===hash(existingPath!));
  let document=existing;
  if(file&&!duplicate){
   document=(await client.query("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,uploaded_by,applicant_number,review_status,reviewed_at,reviewed_by) VALUES('property',$1,$2,$3,$4,$5,$6,$7,1,'approved',NOW(),$7) RETURNING *",[propertyId,docType,file.filename,file.originalname,file.mimetype,file.size,user.id])).rows[0];
   retained=true;
  }
  if(expiryField)await client.query(`UPDATE properties SET ${expiryField}=$1,updated_at=NOW() WHERE id=$2`,[expiryDate,propertyId]);
  else await client.query('UPDATE properties SET updated_at=NOW() WHERE id=$1',[propertyId]);
  await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'property_compliance_saved','property',$3,$4)",[user.id,user.email,propertyId,JSON.stringify({document_id:document.id,previous_document_id:existing?.id||null,doc_type:docType,original_name:document.original_name,duplicate,operation:file&&!duplicate?(existing?'replaced':'uploaded'):'expiry_updated',source:enquiryId?'Tenant onboarding':'Property record',enquiry_id:enquiryId||null,stage:enquiryId?'Tenancy Agreement':undefined,expiry_date:expiryField?{from:property[expiryField]||null,to:expiryDate}:undefined})]);
  await client.query('COMMIT');committed=true;
  return {success:true,property_id:propertyId,document:{id:document.id,doc_type:docType,original_name:document.original_name},expiry_date:expiryField?expiryDate:null,duplicate};
 }catch(error){if(client)await client.query('ROLLBACK');throw error;}
 finally{
  client?.release();
  if(incoming&&(!committed||!retained))try{fs.rmSync(incoming,{force:true});}catch{console.error('Could not clean up unused compliance upload');}
 }
}
