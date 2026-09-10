export interface ActiveTenantPlacement {
  is_joint_tenancy?: number;
  tenancy_start_date?: string | Date;
  tenancy_end_date?: string | Date;
}

export function dateOnly(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

export function tenantPlacementStatus(
  activeTenants: ActiveTenantPlacement[],
  startDate: string,
  isJointTenancy: boolean,
  today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()),
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
