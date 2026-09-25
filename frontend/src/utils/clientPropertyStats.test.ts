import { describe, expect, it } from 'vitest';
import { clientPropertyStats } from './clientPropertyStats';

describe('client property statistics', () => {
  it('counts open client properties by service and uses managed properties for occupancy', () => {
    const properties = [
      { landlord_id: 1, status: 'to_let', service_type: 'let_only', has_live_tenancy: 0 },
      { landlord_id: 1, status: 'let_agreed', service_type: 'let_only', has_live_tenancy: 0 },
      { landlord_id: 1, status: 'closed', service_type: 'let_only', has_live_tenancy: 0 },
      { landlord_id: 1, status: 'let', service_type: 'rent_collection', has_live_tenancy: 1 },
      { landlord_id: 1, status: 'to_let', service_type: 'rent_collection', has_live_tenancy: 0 },
      { landlord_id: 2, status: 'let', service_type: 'full_management', has_live_tenancy: true },
      { landlord_id: 2, status: 'let_agreed', service_type: 'full_management', has_live_tenancy: 0 },
      { landlord_id: 2, status: 'closed', service_type: 'full_management', has_live_tenancy: 0 },
      { landlord_id: 3, status: 'let', service_type: 'full_management', has_live_tenancy: 1 },
    ];
    expect(clientPropertyStats(properties, [1, 2])).toEqual({ letOnly: 2, rentCollection: 2, fullManagement: 2, occupied: 2, managed: 4, occupancy: 50 });
  });

  it('shows no occupancy rate when there are no managed properties', () => {
    expect(clientPropertyStats([{ landlord_id: 1, status: 'to_let', service_type: 'let_only' }], [1]).occupancy).toBeNull();
    expect(clientPropertyStats([], []).occupancy).toBeNull();
  });

  it('respects the client selection', () => {
    expect(clientPropertyStats([{ landlord_id: 1, status: 'let', service_type: 'full_management', has_live_tenancy: 1 }], [])).toEqual({ letOnly: 0, rentCollection: 0, fullManagement: 0, occupied: 0, managed: 0, occupancy: null });
  });
});
