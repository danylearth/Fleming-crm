import type {PoolClient} from 'pg';
import {dateOnly} from './tenant-lifecycle';

export async function seedTenantApplication(client:PoolClient,tenant:any,enquiryId:number,user?:any){
 const draft=(await client.query('SELECT * FROM tenant_enquiries WHERE id=$1 FOR UPDATE',[enquiryId])).rows[0];
 if(!draft||draft.source_tenant_id!==tenant.id||draft.application_form_sent||draft.application_form_completed||draft.application_form_token)return;
 const previous=tenant.source_enquiry_id?(await client.query('SELECT first_name_1,last_name_1,email_1,app_form_data,app_ni_number FROM tenant_enquiries WHERE id=$1',[tenant.source_enquiry_id])).rows[0]:null;
 const property=(await client.query('SELECT address,address_line_2,city,postcode FROM properties WHERE id=$1',[tenant.property_id])).rows[0];
 const samePerson=previous&&((Boolean(tenant.email?.trim())&&String(previous.email_1||'').trim().toLowerCase()===String(tenant.email).trim().toLowerCase())||[previous.first_name_1,previous.last_name_1].join(' ').trim().toLowerCase()===String(tenant.name||'').trim().toLowerCase());
 const saved=samePerson?previous.app_form_data||{}:{};
 const form={first_name:draft.first_name_1,last_name:draft.last_name_1,email:draft.email_1,phone:draft.phone_1,date_of_birth:dateOnly(tenant.date_of_birth_1)||saved.date_of_birth||'',ni_number:(samePerson?previous.app_ni_number:'')||saved.ni_number||'',current_address_line_1:property?.address||tenant.current_address||'',current_address_line_2:property?.address_line_2||'',current_address_city:property?.city||'',current_address_postcode:property?.postcode||'',...draft.app_form_data};
 // No old income, statements, declarations, credit decisions or signatures are copied.
 await client.query('UPDATE tenant_enquiries SET app_form_data=$1,current_address_1=$2,postcode_1=$3 WHERE id=$4',[JSON.stringify(form),[property?.address,property?.address_line_2,property?.city,property?.postcode].filter(Boolean).join(', ')||tenant.current_address,property?.postcode||null,enquiryId]);
 const copied=await client.query(`INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,applicant_number,review_status,reviewed_at,reviewed_by)
  SELECT DISTINCT ON (d.doc_type,d.filename) 'tenant_enquiry',$1,d.doc_type,d.filename,d.original_name,d.mime_type,d.size,1,'approved',d.reviewed_at,d.reviewed_by FROM documents d
  WHERE d.entity_type='tenant' AND d.entity_id=$2 AND d.doc_type IN ('Primary Identification','Secondary Identification') AND d.review_status='approved'
  AND NOT EXISTS(SELECT 1 FROM documents existing WHERE existing.entity_type='tenant_enquiry' AND existing.entity_id=$1 AND existing.filename=d.filename AND existing.doc_type=d.doc_type) ORDER BY d.doc_type,d.filename,d.id DESC`,[enquiryId,tenant.id]);
 await client.query(`UPDATE tenant_enquiries SET
  id_primary_verified_1=CASE WHEN EXISTS(SELECT 1 FROM documents WHERE entity_type='tenant_enquiry' AND entity_id=$1 AND doc_type='Primary Identification' AND review_status='approved') THEN 1 ELSE id_primary_verified_1 END,
  id_secondary_verified_1=CASE WHEN EXISTS(SELECT 1 FROM documents WHERE entity_type='tenant_enquiry' AND entity_id=$1 AND doc_type='Secondary Identification' AND review_status='approved') THEN 1 ELSE id_secondary_verified_1 END
  WHERE id=$1`,[enquiryId]);
 if(copied.rowCount||JSON.stringify(form)!==JSON.stringify(draft.app_form_data||{}))await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'application_prefilled','tenant_enquiry',$3,$4)",[user?.id||null,user?.email||null,enquiryId,JSON.stringify({source_tenant_id:tenant.id,identity_documents_copied:copied.rowCount,fresh_financial_evidence_required:true})]);
}
