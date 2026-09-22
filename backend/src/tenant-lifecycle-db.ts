import {syncPropertyInspectionTasks} from './property-inspections';
import { applyDueRentReviews } from './rent-review';
import { run } from './db-pg';

export async function syncTenantLifecycle(): Promise<void> {
  await run(`UPDATE tenants SET status='inactive', updated_at=NOW()
    WHERE COALESCE(status, 'active') IN ('active','scheduled') AND has_end_date=1
      AND tenancy_end_date IS NOT NULL AND tenancy_end_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London')::date`);
  await run(`WITH placements AS (
      SELECT t.id,concat_ws(', ',p.address,CASE WHEN position(lower(COALESCE(p.postcode,'')) in lower(p.address))=0 THEN p.postcode END) AS address
      FROM tenants t JOIN properties p ON p.id=t.property_id
      WHERE t.status='scheduled' AND t.tenancy_start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London')::date
      AND NOT EXISTS (SELECT 1 FROM tenants current WHERE current.property_id=t.property_id AND COALESCE(current.status,'active')='active')
    ) UPDATE tenants scheduled SET status='active', updated_at=NOW(),
      address_before_previous=CASE WHEN NULLIF(trim(scheduled.current_address),'') IS NOT NULL AND lower(trim(scheduled.current_address))<>lower(placements.address) THEN scheduled.previous_address ELSE scheduled.address_before_previous END,
      previous_address=CASE WHEN NULLIF(trim(scheduled.current_address),'') IS NOT NULL AND lower(trim(scheduled.current_address))<>lower(placements.address) THEN scheduled.current_address ELSE scheduled.previous_address END,
      current_address=placements.address
    FROM placements WHERE scheduled.id=placements.id AND scheduled.status='scheduled'`);
  await run(`UPDATE properties property SET
      tenant_id=(SELECT MIN(tenant.id) FROM tenants tenant WHERE tenant.property_id=property.id AND COALESCE(tenant.status, 'active')='active'),
      has_live_tenancy=CASE WHEN EXISTS (
        SELECT 1 FROM tenants tenant WHERE tenant.property_id=property.id AND COALESCE(tenant.status, 'active')='active'
      ) THEN 1 ELSE 0 END,
      updated_at=NOW()
    WHERE property.tenant_id IS DISTINCT FROM (
      SELECT MIN(tenant.id) FROM tenants tenant WHERE tenant.property_id=property.id AND COALESCE(tenant.status, 'active')='active'
    ) OR property.has_live_tenancy IS DISTINCT FROM CASE WHEN EXISTS (
      SELECT 1 FROM tenants tenant WHERE tenant.property_id=property.id AND COALESCE(tenant.status, 'active')='active'
    ) THEN 1 ELSE 0 END`);
  await run(`UPDATE properties p SET status=CASE
    WHEN EXISTS (SELECT 1 FROM tenants t WHERE t.property_id=p.id AND COALESCE(t.status,'active')='active') THEN 'let'
    WHEN EXISTS (SELECT 1 FROM tenants t WHERE t.property_id=p.id AND t.status='scheduled') THEN 'let_agreed'
    WHEN p.status='let' THEN 'to_let' ELSE p.status END
    WHERE p.status IN ('to_let','let_agreed','let') AND p.status IS DISTINCT FROM CASE
    WHEN EXISTS (SELECT 1 FROM tenants t WHERE t.property_id=p.id AND COALESCE(t.status,'active')='active') THEN 'let'
    WHEN EXISTS (SELECT 1 FROM tenants t WHERE t.property_id=p.id AND t.status='scheduled') THEN 'let_agreed'
    WHEN p.status='let' THEN 'to_let' ELSE p.status END`);
  await run(`UPDATE properties p SET tenancy_start_date=t.tenancy_start_date, tenancy_end_date=t.tenancy_end_date,
    has_end_date=COALESCE(t.has_end_date,0), tenancy_type=t.tenancy_type
    FROM (SELECT DISTINCT ON (property_id) property_id, tenancy_start_date, tenancy_end_date, has_end_date, tenancy_type
      FROM tenants WHERE status IN ('active','scheduled') AND property_id IS NOT NULL
      ORDER BY property_id, CASE WHEN status='active' THEN 0 ELSE 1 END, tenancy_start_date, id) t
    WHERE t.property_id=p.id AND (p.tenancy_start_date IS DISTINCT FROM t.tenancy_start_date
      OR p.tenancy_end_date IS DISTINCT FROM t.tenancy_end_date OR p.has_end_date IS DISTINCT FROM COALESCE(t.has_end_date,0)
      OR p.tenancy_type IS DISTINCT FROM t.tenancy_type)`);
  await run(`WITH inserted AS (INSERT INTO tasks(title,priority,status,due_date,task_type,entity_type,entity_id)
    SELECT 'Inventory Due — ' || t.name || ' — ' || p.address,CASE WHEN t.tenancy_start_date<=CURRENT_DATE-7 THEN 'high' ELSE 'medium' END,'pending',t.tenancy_start_date,'inventory_due','tenant',t.id
    FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.status='active' AND p.archived_at IS NULL AND t.tenancy_start_date<=CURRENT_DATE
      AND NOT EXISTS(SELECT 1 FROM tenants j WHERE j.id=t.linked_tenant_id AND j.id<t.id AND j.property_id=t.property_id AND j.tenancy_start_date=t.tenancy_start_date)
      AND NOT EXISTS(SELECT 1 FROM inventories i WHERE i.property_id=t.property_id AND i.inspection_date>=t.tenancy_start_date AND (i.tenant_id=t.id OR i.tenant_id IN(SELECT id FROM tenants j WHERE j.id=t.linked_tenant_id AND j.property_id=t.property_id AND j.tenancy_start_date=t.tenancy_start_date)) AND (i.signed_date IS NOT NULL OR i.signed_document))
      AND NOT EXISTS(SELECT 1 FROM tasks task WHERE task.task_type='inventory_due' AND task.entity_type='tenant' AND task.entity_id=t.id AND task.due_date=t.tenancy_start_date)
    ON CONFLICT DO NOTHING RETURNING id,task_type) INSERT INTO audit_log(action,entity_type,entity_id,changes) SELECT 'create','task',id,json_build_object('source','tenant lifecycle','task_type',task_type)::text FROM inserted`);
  await run(`UPDATE tasks task SET priority='high',dashboard_dismissed_at=NULL WHERE task_type='inventory_due' AND status IN ('pending','in_progress') AND due_date<=CURRENT_DATE-7 AND priority<>'high'`);
  await run(`UPDATE tasks task SET status='completed' WHERE task_type='inventory_due' AND status IN ('pending','in_progress') AND EXISTS(SELECT 1 FROM tenants t WHERE t.id=task.entity_id AND (t.status='inactive' OR task.due_date IS DISTINCT FROM t.tenancy_start_date OR EXISTS(SELECT 1 FROM inventories i WHERE i.property_id=t.property_id AND i.inspection_date>=t.tenancy_start_date AND (i.tenant_id=t.id OR i.tenant_id IN(SELECT id FROM tenants j WHERE j.id=t.linked_tenant_id AND j.property_id=t.property_id AND j.tenancy_start_date=t.tenancy_start_date)) AND (i.signed_date IS NOT NULL OR i.signed_document))))`);
  await run(`UPDATE tasks task SET status='pending',dashboard_dismissed_at=NULL WHERE task_type='inventory_due' AND status='completed' AND EXISTS(SELECT 1 FROM tenants t WHERE t.id=task.entity_id AND t.status='active' AND task.due_date=t.tenancy_start_date AND NOT EXISTS(SELECT 1 FROM inventories i WHERE i.property_id=t.property_id AND i.inspection_date>=t.tenancy_start_date AND (i.tenant_id=t.id OR i.tenant_id IN(SELECT id FROM tenants j WHERE j.id=t.linked_tenant_id AND j.property_id=t.property_id AND j.tenancy_start_date=t.tenancy_start_date)) AND (i.signed_date IS NOT NULL OR i.signed_document)))`);
  await run(`WITH inserted AS (INSERT INTO tasks(title,priority,status,due_date,task_type,entity_type,entity_id)
    SELECT 'Insurance Renewal — ' || p.address || ' — obtain a new quote/policy',CASE WHEN MIN(pol.expiry_date)<=CURRENT_DATE THEN 'high' ELSE 'medium' END,'pending',MIN(pol.expiry_date),'insurance_renewal','property',p.id
    FROM property_policies pol JOIN property_policy_allocations a ON a.policy_id=pol.id JOIN properties p ON p.id=a.property_id
    WHERE p.archived_at IS NULL AND pol.expiry_date<=CURRENT_DATE+14
    AND NOT EXISTS(SELECT 1 FROM property_policies newer JOIN property_policy_allocations na ON na.policy_id=newer.id WHERE na.property_id=p.id AND newer.policy_type=pol.policy_type AND newer.expiry_date>pol.expiry_date AND newer.commencement_date<=pol.expiry_date+1)
    AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.entity_type='property' AND t.entity_id=p.id AND t.task_type='insurance_renewal' AND t.status IN ('pending','in_progress')) GROUP BY p.id ON CONFLICT DO NOTHING RETURNING id,task_type) INSERT INTO audit_log(action,entity_type,entity_id,changes) SELECT 'create','task',id,json_build_object('source','tenant lifecycle','task_type',task_type)::text FROM inserted`);
  await run(`WITH renewals AS (SELECT p.id,MIN(pol.expiry_date) AS expiry FROM property_policies pol JOIN property_policy_allocations a ON a.policy_id=pol.id JOIN properties p ON p.id=a.property_id WHERE p.archived_at IS NULL AND pol.expiry_date<=CURRENT_DATE+14 AND NOT EXISTS(SELECT 1 FROM property_policies newer JOIN property_policy_allocations na ON na.policy_id=newer.id WHERE na.property_id=p.id AND newer.policy_type=pol.policy_type AND newer.expiry_date>pol.expiry_date AND newer.commencement_date<=pol.expiry_date+1) GROUP BY p.id) UPDATE tasks task SET due_date=r.expiry,priority=CASE WHEN r.expiry<=CURRENT_DATE THEN 'high' ELSE 'medium' END FROM renewals r WHERE task.task_type='insurance_renewal' AND task.entity_type='property' AND task.entity_id=r.id AND task.status IN ('pending','in_progress') AND task.due_date IS DISTINCT FROM r.expiry`);
  await run(`UPDATE tasks task SET status='completed' WHERE task_type='insurance_renewal' AND status IN ('pending','in_progress') AND NOT EXISTS (
    SELECT 1 FROM property_policies pol JOIN property_policy_allocations a ON a.policy_id=pol.id JOIN properties p ON p.id=a.property_id
    WHERE p.id=task.entity_id AND p.archived_at IS NULL AND pol.expiry_date<=CURRENT_DATE+14
    AND NOT EXISTS(SELECT 1 FROM property_policies newer JOIN property_policy_allocations na ON na.policy_id=newer.id WHERE na.property_id=p.id AND newer.policy_type=pol.policy_type AND newer.expiry_date>pol.expiry_date AND newer.commencement_date<=pol.expiry_date+1))`);
  await run(`UPDATE tasks SET priority='high',dashboard_dismissed_at=NULL WHERE task_type='insurance_renewal' AND status IN ('pending','in_progress') AND due_date<=CURRENT_DATE AND priority<>'high'`);
  // Retire the old per-policy reminders after the canonical per-property reminders exist.
  await run(`WITH retired AS (UPDATE tasks SET status='completed' WHERE task_type='insurance_reminder'
    AND entity_type='property_policy' AND status IN ('pending','in_progress') RETURNING id)
    INSERT INTO audit_log(action,entity_type,entity_id,changes) SELECT 'update','task',id,
      '{"source":"tenant lifecycle","reason":"Replaced by per-property insurance renewal reminders"}' FROM retired`);
  await applyDueRentReviews();
  await syncPropertyInspectionTasks();
}
