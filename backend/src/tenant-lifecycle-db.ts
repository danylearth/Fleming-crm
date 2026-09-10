import { applyDueRentReviews } from './rent-review';
import { run } from './db-pg';

export async function syncTenantLifecycle(): Promise<void> {
  await run(`UPDATE tenants SET status='inactive', updated_at=NOW()
    WHERE COALESCE(status, 'active') IN ('active','scheduled') AND has_end_date=1
      AND tenancy_end_date IS NOT NULL AND tenancy_end_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London')::date`);
  await run(`UPDATE tenants scheduled SET status='active', updated_at=NOW()
    WHERE scheduled.status='scheduled' AND scheduled.tenancy_start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London')::date
      AND NOT EXISTS (
        SELECT 1 FROM tenants current
        WHERE current.property_id=scheduled.property_id
          AND COALESCE(current.status, 'active')='active'
      )`);
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
  await applyDueRentReviews();
}
