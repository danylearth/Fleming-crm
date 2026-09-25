ALTER TABLE property_inspections
 ADD COLUMN internal_condition TEXT CHECK(internal_condition IN ('bad','needs_repair','good','excellent')),
 ADD COLUMN external_condition TEXT CHECK(external_condition IN ('bad','needs_repair','good','excellent','not_applicable')),
 ADD COLUMN damage_noticed BOOLEAN,
 ADD COLUMN damage_details TEXT;

-- An office-confirmed historical baseline, not a fabricated inspection visit.
CREATE TABLE property_inspection_baselines (
 property_id INTEGER NOT NULL REFERENCES properties(id),
 tenant_id INTEGER NOT NULL REFERENCES tenants(id),
 tenancy_start_date DATE NOT NULL,
 through_date DATE NOT NULL,
 condition TEXT NOT NULL CHECK(condition='good'),
 notes TEXT NOT NULL,
 PRIMARY KEY(property_id,tenant_id,tenancy_start_date)
);
INSERT INTO property_inspection_baselines
 SELECT p.id,t.id,t.tenancy_start_date,DATE '2026-09-25','good',
 'Office confirmed all historical inspections through 25 September 2026 were good. Individual visit dates and condition answers were not supplied.'
 FROM properties p JOIN landlords l ON l.id=p.landlord_id
 JOIN tenants t ON t.property_id=p.id
 WHERE p.archived_at IS NULL AND (l.landlord_type='internal' OR p.service_type='full_management')
 AND t.status IN ('active','scheduled') AND t.tenancy_start_date<=DATE '2026-09-25'
 AND t.created_at<DATE '2026-09-26';
INSERT INTO audit_log(action,entity_type,entity_id,changes)
 SELECT 'historical_inspection_baseline','property',property_id,
 json_build_object('source','Office instruction, 25 September 2026','tenant_id',tenant_id,'through_date',through_date,'condition',condition)::text
 FROM property_inspection_baselines;
