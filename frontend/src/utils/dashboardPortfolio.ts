export type PortfolioRecord = { id: number; landlord_type?: string; property_id?: number; landlord_id?: number; status?: string };
export type LinkedTask = { entity_type?: string; entity_id?: number; landlord_type?: string };

// Resolve ownership through saved record IDs; never guess from an address or assignee.
export function portfolioMatcher(records: {
  properties: PortfolioRecord[]; tenants: PortfolioRecord[]; landlords: PortfolioRecord[];
  enquiries: PortfolioRecord[]; maintenance: PortfolioRecord[];
}, filter: 'all' | 'internal' | 'external') {
  const properties = new Map(records.properties.map(p => [p.id, p.landlord_type]));
  const recordType = (record?: PortfolioRecord) => record?.landlord_type || (record?.property_id ? properties.get(record.property_id) : undefined);
  const lookup = (rows: PortfolioRecord[], id?: number) => recordType(rows.find(r => r.id === id));
  const matches = (type?: string) => filter === 'all' || type === filter;
  return {
    record: (record: PortfolioRecord) => matches(recordType(record)),
    property: (id: number) => matches(properties.get(id)),
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
