import { describe, expect, it } from 'vitest';
import { tenantPlacementStatus } from './tenant-lifecycle';

describe('tenant placement lifecycle', () => {
  const today = '2026-09-03';

  it('creates a live tenancy when the property is vacant', () => {
    expect(tenantPlacementStatus([], '2026-09-03', false, today)).toBe('active');
  });

  it('allows both records belonging to the same joint tenancy', () => {
    expect(tenantPlacementStatus([
      { is_joint_tenancy: 1, tenancy_start_date: '2026-09-03' },
    ], '2026-09-03', true, today)).toBe('active');
  });

  it('schedules a new tenancy after the live tenancy ends', () => {
    expect(tenantPlacementStatus([
      { is_joint_tenancy: 0, tenancy_start_date: '2025-09-01', tenancy_end_date: '2026-09-30' },
    ], '2026-10-01', false, today)).toBe('scheduled');
  });

  it('blocks a second unrelated live tenancy', () => {
    expect(tenantPlacementStatus([
      { is_joint_tenancy: 0, tenancy_start_date: '2025-09-01' },
    ], '2026-10-01', false, today)).toBeNull();
  });
});
