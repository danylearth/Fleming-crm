-- Extend ratings without changing any existing inspection answers.
ALTER TABLE property_inspections
 DROP CONSTRAINT property_inspections_condition_check,
 ADD CONSTRAINT property_inspections_condition_check
 CHECK (condition IN ('bad','needs_repair','average','good','very_good','excellent')),
 DROP CONSTRAINT property_inspections_internal_condition_check,
 ADD CONSTRAINT property_inspections_internal_condition_check
 CHECK (internal_condition IN ('bad','needs_repair','average','good','very_good','excellent')),
 DROP CONSTRAINT property_inspections_external_condition_check,
 ADD CONSTRAINT property_inspections_external_condition_check
 CHECK (external_condition IN ('bad','needs_repair','average','good','very_good','excellent','not_applicable'));
