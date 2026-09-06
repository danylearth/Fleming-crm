export interface PropertyTenant {
  id: number;
  name: string;
  property_id?: number;
  status?: string;
  notes?: string;
  email?: string;
  phone?: string;
  first_name_1?: string;
  last_name_1?: string;
  email_1?: string;
  phone_1?: string;
  tenancy_start_date?: string;
  tenancy_end_date?: string;
}

export function activePropertyTenants(tenants: PropertyTenant[], propertyId: number) {
  return tenants.filter(tenant => tenant.property_id === propertyId && !['inactive', 'scheduled'].includes(tenant.status || 'active'));
}
