export interface ActiveTenantPlacement {
  is_joint_tenancy?: number;
  tenancy_start_date?: string;
  tenancy_end_date?: string;
}

export function dateOnly(value: unknown): string {
  return String(value || '').slice(0, 10);
}

export function tenantPlacementStatus(
  activeTenants: ActiveTenantPlacement[],
  startDate: string,
  isJointTenancy: boolean,
  today = new Date().toISOString().slice(0, 10),
): 'active' | 'scheduled' | null {
  if (activeTenants.length === 0) return startDate > today ? 'scheduled' : 'active';

  const joinsExistingJointTenancy = isJointTenancy && activeTenants.every(tenant =>
    Boolean(tenant.is_joint_tenancy) && dateOnly(tenant.tenancy_start_date) === startDate
  );
  if (joinsExistingJointTenancy) return 'active';

  const endDates = activeTenants.map(tenant => dateOnly(tenant.tenancy_end_date)).filter(Boolean).sort();
  if (endDates.length === activeTenants.length && startDate > endDates[endDates.length - 1]) return 'scheduled';
  return null;
}
