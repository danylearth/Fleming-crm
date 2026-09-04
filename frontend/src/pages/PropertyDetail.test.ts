import { describe, expect, it } from 'vitest';
import { activePropertyTenants } from '../utils/propertyTenants';

describe('activePropertyTenants', () => {
  it('returns every active joint tenant linked to the property', () => {
    const tenants = [
      { id: 16, name: 'Julia Roberts', property_id: 19, status: 'active' },
      { id: 17, name: 'Katie Roberts', property_id: 19, status: 'active' },
      { id: 18, name: 'Future Tenant', property_id: 19, status: 'scheduled' },
      { id: 13, name: 'Neil Thompson', property_id: 17, status: 'active' },
    ];

    expect(activePropertyTenants(tenants, 19).map((tenant) => tenant.name)).toEqual([
      'Julia Roberts',
      'Katie Roberts',
    ]);
  });
});
