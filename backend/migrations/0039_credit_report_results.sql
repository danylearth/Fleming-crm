-- Keep each result with its report so history follows each applicant into tenancy.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS credit_check_result JSONB;
-- Preserve the score for existing manually uploaded reports.
UPDATE documents d SET credit_check_result = jsonb_build_object('provider', 'Manual', 'score', e.credit_score)
FROM tenant_enquiries e WHERE d.entity_type='tenant_enquiry' AND d.entity_id=e.id
AND d.doc_type='Credit Check Report' AND d.credit_check_result IS NULL
AND NULLIF(e.credit_score, '') IS NOT NULL
AND (SELECT COUNT(*) FROM documents x WHERE x.entity_type=d.entity_type AND x.entity_id=d.entity_id AND x.doc_type=d.doc_type)=1;
UPDATE documents d SET credit_check_result=s.credit_check_result
FROM tenants t, documents s WHERE d.entity_type='tenant' AND d.entity_id=t.id
AND s.entity_type='tenant_enquiry' AND s.entity_id=t.source_enquiry_id
AND d.filename=s.filename AND d.doc_type='Credit Check Report'
AND d.credit_check_result IS NULL AND s.credit_check_result IS NOT NULL;
