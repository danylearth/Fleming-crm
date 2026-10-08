export type PortfolioRecord = { id: number; landlord_type?: string; property_id?: number | null; linked_property_id?: number | null; landlord_id?: number | null; status?: string; monthly_rent?: number | string; rent_amount?: number | string };
export type LinkedTask = { entity_type?: string; entity_id?: number; landlord_type?: string };

// Resolve ownership through saved record IDs; never guess from an address or assignee.
export function portfolioMatcher(records: {
  properties: PortfolioRecord[]; tenants: PortfolioRecord[]; landlords: PortfolioRecord[];
  enquiries: PortfolioRecord[]; maintenance: PortfolioRecord[];
}, filter: 'all' | 'internal' | 'external') {
  const landlords = new Map(records.landlords.map(l => [Number(l.id), l.landlord_type]));
  const properties = new Map(records.properties.map(p => [Number(p.id), p.landlord_type || landlords.get(Number(p.landlord_id))]));
  const recordType = (record?: PortfolioRecord) => {
    if (!record) return undefined;
    const propertyId = record.linked_property_id || record.property_id;
    return (propertyId ? properties.get(Number(propertyId)) : undefined) || record.landlord_type || landlords.get(Number(record.landlord_id));
  };
  const lookup = (rows: PortfolioRecord[], id?: number) => recordType(rows.find(r => r.id === id));
  const matches = (type?: string) => filter === 'all' || type === filter;
  return {
    record: (record: PortfolioRecord) => matches(recordType(record)),
    property: (id: number) => matches(properties.get(id)),
    tenant: (id: number) => matches(lookup(records.tenants, id)),
    enquiry: (id: number) => matches(lookup(records.enquiries, id)),
    landlord: (id: number) => matches(landlords.get(Number(id))),
    maintenance: (id: number) => matches(lookup(records.maintenance, id)),
    task: (task: LinkedTask) => {
      let type = task.landlord_type;
      if (!type) switch (task.entity_type) {
        case 'property': type = properties.get(task.entity_id!); break;
        case 'tenant': type = lookup(records.tenants, task.entity_id); break;
        case 'landlord': type = lookup(records.landlords, task.entity_id); break;
        case 'tenant_enquiry': type = lookup(records.enquiries, task.entity_id); break;
        case 'maintenance': type = lookup(records.maintenance, task.entity_id); break;
        case 'landlord_bdm': type = 'external'; break;
      }
      return matches(type);
    },
  };
}
