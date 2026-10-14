import type {Express} from 'express';
import {authMiddleware} from './auth';
import {query} from './db-pg';

// Only workflow metadata is returned: no application answers, bank details or signatures.
export const guarantorPipelineSql = `(SELECT CASE
 WHEN g.status='verified' THEN 'complete'
 WHEN g.status='witness_declined' OR COALESCE(g.workflow->>'deedNeedsResigning','false')='true' THEN 'action'
 WHEN g.workflow->>'reviewStatus'='changes_requested' AND g.workflow->>'changesSent' IS NOT NULL
   THEN CASE WHEN g.expires_at<=NOW() OR (SELECT m.status FROM email_messages m WHERE m.entity_type='tenant_enquiry' AND m.entity_id=te.id AND m.template='guarantor_changes' ORDER BY m.id DESC LIMIT 1) IN ('failed','bounced','suppressed') THEN 'action' ELSE 'waiting' END
 WHEN g.signature IS NOT NULL AND g.submitted_at IS NOT NULL AND COALESCE(g.workflow->>'reviewStatus','pending')<>'approved' THEN 'review'
 WHEN g.signature IS NOT NULL AND COALESCE(g.workflow->'credit'->>'credit_check_completed','0') NOT IN ('true','1') THEN 'action'
 WHEN g.signature IS NOT NULL AND x.status='awaiting_witness' THEN CASE
   WHEN x.witness_expires_at<=NOW() OR EXISTS(SELECT 1 FROM guarantor_execution_emails m WHERE m.execution_id=x.id AND m.kind='witness_request' AND (m.status IN ('failed','simulated') OR EXISTS(SELECT 1 FROM email_messages em WHERE em.resend_id=m.resend_id AND em.status IN ('bounced','suppressed','failed')))) THEN 'action' ELSE 'waiting' END
 WHEN g.signature IS NOT NULL THEN 'action'
 WHEN g.status='invited' AND (g.expires_at IS NULL OR g.expires_at>NOW())
   AND COALESCE((SELECT m.status FROM email_messages m WHERE m.entity_type='tenant_enquiry' AND m.entity_id=te.id AND m.template='guarantor_request' ORDER BY m.id DESC LIMIT 1),'') NOT IN ('failed','bounced','suppressed','simulated')
   AND COALESCE(g.workflow->'lastResent'->>'status',g.workflow->'invitationDelivery'->>'status','') NOT IN ('failed','simulated') THEN 'waiting'
 ELSE 'action' END FROM guarantor_verifications g LEFT JOIN guarantor_executions x ON x.id=g.execution_id
 WHERE g.enquiry_id=te.id AND te.guarantor_required=TRUE)`;

export const tenantPipelineFieldsSql = `
 (SELECT jsonb_object_agg(m.template,m.status) FROM (SELECT DISTINCT ON (template) template,status FROM email_messages
   WHERE entity_type='tenant_enquiry' AND entity_id=te.id AND template IN ('holding_deposit_request','tenancy_application','application_changes_requested','final_balance') ORDER BY template,id DESC) m) AS pipeline_delivery,
 (SELECT CASE WHEN ta.status='completed' THEN false ELSE
   (COALESCE(ta.requires_landlord_signature,0)=0 OR ta.landlord_signed_at IS NOT NULL) AND ta.tenant_delivery_sent_at IS NULL
   OR (ta.requires_landlord_signature=1 AND ta.landlord_signed_at IS NULL
     AND NOT EXISTS(SELECT 1 FROM email_messages m WHERE m.entity_type='tenant_enquiry' AND m.entity_id IN(te.id,te.joint_partner_id) AND m.template='landlord_tenancy_agreement' AND m.created_at>=ta.issued_at)
     AND NOT EXISTS(SELECT 1 FROM sms_messages m WHERE m.entity_type='tenant_enquiry' AND m.entity_id IN(te.id,te.joint_partner_id) AND m.message_body LIKE '%'||ta.landlord_slug||'%' AND m.created_at>=ta.issued_at AND m.status NOT IN ('failed','undelivered','simulated')))
   OR EXISTS(SELECT 1 FROM (SELECT DISTINCT ON (m.to_email) m.status FROM email_messages m
     WHERE m.entity_type='tenant_enquiry' AND m.entity_id IN(te.id,te.joint_partner_id) AND m.template IN ('tenancy_agreement','landlord_tenancy_agreement') AND m.created_at>=ta.issued_at ORDER BY m.to_email,m.id DESC) latest WHERE latest.status IN ('failed','bounced','suppressed','simulated')) END
   FROM tenancy_agreements ta WHERE ta.enquiry_id IN(te.id,te.joint_partner_id) AND ta.status<>'void' ORDER BY ta.id DESC LIMIT 1) AS tenancy_agreement_action`;

export const landlordOnboardingSql = `SELECT l.id AS landlord_id,l.name,l.kyc_completed,p.id AS property_id,p.address AS property_address,
 p.updated_at,sa.status AS contract_status,sa.delivery_status,sa.signed_at,
 EXISTS(SELECT 1 FROM property_service_overrides o WHERE o.property_id=p.id AND o.landlord_id=l.id AND o.service_type=p.service_type AND o.revoked_at IS NULL) AS service_override,
 b.approved_at AS bank_approved_at,b.landlord_approved_at,
 EXISTS(SELECT 1 FROM documents d WHERE d.entity_type='landlord' AND d.entity_id=l.id AND d.doc_type='Primary Identification') AS has_primary_id,
 (SELECT COALESCE(u.name,a.user_email) FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
   WHERE a.entity_type='property' AND a.entity_id=p.id AND a.user_id IS NOT NULL AND a.action NOT IN ('view','page_view','navigate') ORDER BY a.created_at DESC LIMIT 1) AS previous_agent
 FROM landlords l JOIN properties p ON p.landlord_id=l.id
 LEFT JOIN landlord_bank_details b ON b.landlord_id=l.id
 LEFT JOIN LATERAL(SELECT a.status,CASE WHEN message.status IN ('failed','bounced','suppressed') THEN message.status ELSE a.delivery_status END AS delivery_status,a.signed_at FROM landlord_service_agreements a
   LEFT JOIN LATERAL(SELECT em.status FROM email_messages em WHERE em.entity_type='landlord' AND em.entity_id=l.id AND em.template='service_agreement'
     AND (em.body_html LIKE '%-contract'||a.id::text||'-%' OR em.body_html LIKE '%'||a.token||'%') ORDER BY em.id DESC LIMIT 1) message ON true
   WHERE a.property_id=p.id AND a.landlord_id=l.id AND a.service_type=p.service_type AND a.status<>'void' ORDER BY a.id DESC LIMIT 1) sa ON true
 WHERE l.landlord_type='external' AND p.archived_at IS NULL AND p.status NOT IN ('archived','sold','closed')
 UNION ALL
 SELECT l.id,l.name,l.kyc_completed,NULL,NULL,l.updated_at,NULL,NULL,NULL,false,NULL,NULL,false,NULL
 FROM landlords l WHERE l.landlord_type='external' AND NOT EXISTS(SELECT 1 FROM properties p WHERE p.landlord_id=l.id)
 AND EXISTS(SELECT 1 FROM audit_log a WHERE a.entity_type='landlord' AND a.entity_id=l.id AND a.action='create' AND a.changes::jsonb ? 'converted_from_bdm')`;

export function registerPipelineStatus(app:Express){
 app.get('/api/dashboard/landlord-onboarding',authMiddleware,async(_req,res)=>{
  res.json(await query(landlordOnboardingSql));
 });
}
