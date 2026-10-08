import type {PoolClient} from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import sharp from 'sharp';
import {signingPdfPages,validateSignatureFields,completeSigningPdf,type SignatureField} from './document-signing-pdf';
import {cropSignature} from './signature-image';
import {executionHash,executionConsent,validateExecutionIdentity,sealGuarantorToken,ensureExecutionBeforeStart} from './guarantor-execution-rules';
import {queueGuarantorExecutionEmail} from './guarantor-execution-email';

export interface GuarantorExecutionSource {
 pdf:Buffer;
 fields:SignatureField[];
 form:Record<string,any>;
 tenancy:{tenantNames:string[];propertyAddress:string;startDate:string;[key:string]:any};
}
export interface ExecutionSignature {
 name:string;
 image:string;
 sourceHash:string;
 declarations:Record<string,boolean>;
 ip?:string;
 userAgent?:string;
 location?:string;
}

async function signatureBytes(image:string){
 if(typeof image!=='string'||image.length>1500000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image))throw Error('Add a valid signature image');
 const bytes=Buffer.from(image.split(',')[1],'base64');
 const meta=await sharp(bytes,{limitInputPixels:2000000}).metadata();
 if(meta.format!=='png'||!meta.width||!meta.height||meta.width>3000||meta.height>1500)throw Error('The signature image is too large');
 return cropSignature(bytes);
}
async function signingEvidence(role:'guarantor'|'witness',row:any,input:ExecutionSignature){
 if(input.sourceHash!==row.source_sha256)throw Error('The deed has changed. Reload and review the current document before signing');
 validateExecutionIdentity(role,row.form_snapshot,input.name);
 const consent=executionConsent(role,input.declarations),image=await signatureBytes(input.image);
 return {name:input.name.trim().replace(/\s+/g,' '),email:role==='guarantor'?row.form_snapshot.email:row.form_snapshot.witnessEmail,
  signed_at:new Date().toISOString(),signature:image.toString('base64'),signing_ip:String(input.ip||'').slice(0,100),
  user_agent:String(input.userAgent||'').slice(0,500),location:String(input.location||'').slice(0,300),consent_snapshot:consent,
  source_sha256:row.source_sha256,role,nominated_name:role==='witness'?row.form_snapshot.witnessName:null};
}
function signer(evidence:any,id:number){return {...evidence,id,signature:Buffer.from(evidence.signature,'base64')};}
async function audit(client:PoolClient,enquiryId:number,action:string,changes:any){
 await client.query(`INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES('public-signing',$1,'tenant_enquiry',$2,$3)`,[action,enquiryId,JSON.stringify(changes)]);
}

// The caller constructs the source from validated CRM data, never from a
// client-supplied PDF or signature-field coordinates. All methods share its transaction.
export async function prepareGuarantorExecution(client:PoolClient,verificationId:number,source:GuarantorExecutionSource){
 const g=(await client.query('SELECT * FROM guarantor_verifications WHERE id=$1 FOR UPDATE',[verificationId])).rows[0];
 if(!g||g.status!=='invited'||g.signature)throw Error('This guarantor application is not open for a new signing');
 validateExecutionIdentity('guarantor',source.form,source.form.name);
 const date=new Date(source.tenancy.startDate+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(source.tenancy.startDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==source.tenancy.startDate||!source.tenancy.tenantNames.length||!source.tenancy.propertyAddress)throw Error('Complete the tenancy particulars before preparing the deed');
 ensureExecutionBeforeStart(source.tenancy.startDate);
 const pages=await signingPdfPages(source.pdf);
 if(pages.length>60)throw Error('The deed and tenancy pack is too large');
 const fields=validateSignatureFields(source.fields,pages,[{id:1},{id:2}]);
 if(fields.some(field=>(field.type||'signature')!=='signature'&&field.type!=='date'))throw Error('Use signature and date fields on the deed');
 const hash=executionHash(source.pdf);
 const current=(await client.query('SELECT * FROM guarantor_executions WHERE id=$1 FOR UPDATE',[g.execution_id])).rows[0];
 if(current?.status==='prepared'&&current.source_sha256===hash&&isDeepStrictEqual(current.form_snapshot,source.form))return current;
 if(current&&current.status!=='prepared')throw Error('The existing signed deed must be reviewed before preparing another signing');
 if(current)await client.query("UPDATE guarantor_executions SET status='superseded' WHERE id=$1",[current.id]);
 const row=(await client.query(`INSERT INTO guarantor_executions(verification_id,source_pdf,source_sha256,signature_fields,form_snapshot,tenancy_snapshot) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[g.id,source.pdf,hash,JSON.stringify(fields),JSON.stringify(source.form),JSON.stringify(source.tenancy)])).rows[0];
 await client.query('UPDATE guarantor_verifications SET execution_id=$1 WHERE id=$2',[row.id,g.id]);
 return row;
}

export async function signGuarantorExecution(client:PoolClient,verificationId:number,tokenHash:string,input:ExecutionSignature){
 await client.query('SELECT e.id FROM tenant_enquiries e JOIN guarantor_verifications g ON g.enquiry_id=e.id WHERE g.id=$1 FOR UPDATE OF e',[verificationId]);
 const g=(await client.query('SELECT g.*,e.guarantor_required FROM guarantor_verifications g JOIN tenant_enquiries e ON e.id=g.enquiry_id WHERE g.id=$1 FOR UPDATE OF g',[verificationId])).rows[0];
 if(!g||g.guarantor_required!==true||g.token_hash!==tokenHash||new Date(g.expires_at).getTime()<=Date.now())throw Error('This invitation has expired or been replaced');
 const row=(await client.query('SELECT * FROM guarantor_executions WHERE id=$1 FOR UPDATE',[g.execution_id])).rows[0];
 if(!row||row.verification_id!==g.id)throw Error('Review the prepared deed before signing');
 if(row.guarantor_signature){
  if(input.sourceHash!==row.source_sha256)throw Error('The signing document has changed');
  return row; // A lost response must not create another signature or witness invitation.
 }
 if(g.status!=='invited'||row.status!=='prepared')throw Error('This deed is no longer open for signing');
 await (await import('./guarantor-gates')).assertCurrentGuarantorTerms(client,g.id);
 ensureExecutionBeforeStart(row.tenancy_snapshot.startDate);
 if(['name','email','address','witnessName','witnessEmail','witnessAddress'].some(key=>String(g.form[key]||'')!==String(row.form_snapshot[key]||'')))throw Error('The application details changed. Review a newly prepared deed before signing');
 const evidence={...await signingEvidence('guarantor',row,input),opened_at:g.workflow?.openedAt||null};
 const partiallySigned=await completeSigningPdf(row.source_pdf,row.signature_fields,[signer(evidence,1)],row.source_sha256,{includeCertificate:false});
 const token=crypto.randomBytes(32).toString('hex');
 const updated=(await client.query(`UPDATE guarantor_executions SET status='awaiting_witness',guarantor_signature=$2,partially_signed_pdf=$3,witness_token_hash=$4,witness_token_encrypted=$5,witness_expires_at=NOW()+INTERVAL '30 days' WHERE id=$1 RETURNING *`,[row.id,JSON.stringify(evidence),partiallySigned,executionHash(token),sealGuarantorToken(token)])).rows[0];
 await client.query("UPDATE guarantor_verifications SET signature=$2,status='awaiting_witness',submitted_at=NOW(),updated_at=NOW() WHERE id=$1",[g.id,JSON.stringify({execution_id:row.id,...evidence})]);
 const url='https://apply.fleminglettings.co.uk/guarantor/#witness-'+token;
 await queueGuarantorExecutionEmail(client,updated,'witness_request',url);
 await audit(client,g.enquiry_id,'guarantor_deed_signed',{execution_id:row.id,source_sha256:row.source_sha256,signed_at:evidence.signed_at});
 return updated;
}

export async function attestGuarantorExecution(client:PoolClient,token:string,input:ExecutionSignature){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('This witness invitation is unavailable');
 const found=(await client.query('SELECT verification_id,id FROM guarantor_executions WHERE witness_token_hash=$1',[executionHash(token)])).rows[0];
 if(!found)throw Error('This witness invitation is unavailable');
 await client.query('SELECT e.id FROM tenant_enquiries e JOIN guarantor_verifications g ON g.enquiry_id=e.id WHERE g.id=$1 FOR UPDATE OF e',[found.verification_id]);
 const g=(await client.query('SELECT g.*,e.guarantor_required FROM guarantor_verifications g JOIN tenant_enquiries e ON e.id=g.enquiry_id WHERE g.id=$1 FOR UPDATE OF g',[found.verification_id])).rows[0];
 const row=(await client.query('SELECT * FROM guarantor_executions WHERE id=$1 FOR UPDATE',[found.id])).rows[0];
 if(g.execution_id!==row.id||g.guarantor_required!==true||row.status==='superseded')throw Error('The office has replaced this signing version');
 if(row.status==='completed'&&row.witness_signature){if(input.sourceHash!==row.source_sha256)throw Error('The signing document has changed');return row;}
 if(row.status!=='awaiting_witness'||!row.guarantor_signature||!row.witness_expires_at||new Date(row.witness_expires_at).getTime()<=Date.now())throw Error('This deed is not awaiting witness attestation or the invitation has expired');
 if(g.workflow?.deedNeedsResigning)throw Error('The application details changed. The office must arrange a new signing before witness attestation');
 await (await import('./guarantor-gates')).assertCurrentGuarantorTerms(client,g.id);
 ensureExecutionBeforeStart(row.tenancy_snapshot.startDate);
 const evidence={...await signingEvidence('witness',row,input),opened_at:g.workflow?.witnessOpenedAt||null};
 const signed=await completeSigningPdf(row.source_pdf,row.signature_fields,[signer(row.guarantor_signature,1),signer(evidence,2)],row.source_sha256,{certificatePageNumbers:false});
 const updated=(await client.query(`UPDATE guarantor_executions SET status='completed',witness_signature=$2,signed_pdf=$3,signed_sha256=$4,completed_at=NOW() WHERE id=$1 RETURNING *`,[row.id,JSON.stringify(evidence),signed,executionHash(signed)])).rows[0];
 await client.query("UPDATE guarantor_verifications SET status='submitted',updated_at=NOW() WHERE id=$1",[g.id]);
 const uploads=path.resolve(process.env.UPLOADS_PATH||path.join(__dirname,'../uploads'));
 const filename='guarantor-deed-'+row.id+'-'+updated.signed_sha256+'.pdf';
 fs.mkdirSync(uploads,{recursive:true});
 const destination=path.join(uploads,filename);
 if(!fs.existsSync(destination))fs.writeFileSync(destination,signed,{flag:'wx'});
 await client.query("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,review_status) SELECT 'tenant_enquiry',$1,'Signed Deed of Guarantee',$2,'Deed of Guarantee — signed.pdf','application/pdf',$3,'approved' WHERE NOT EXISTS(SELECT 1 FROM documents WHERE entity_type='tenant_enquiry' AND entity_id=$1 AND filename=$2)",[g.enquiry_id,filename,signed.length]);
 await queueGuarantorExecutionEmail(client,updated,'completed_deed');
 await audit(client,g.enquiry_id,'guarantor_deed_witnessed',{execution_id:row.id,source_sha256:row.source_sha256,signed_sha256:updated.signed_sha256,signed_at:evidence.signed_at,nominated_name:row.form_snapshot.witnessName,confirmed_name:evidence.name});
 return updated;
}
