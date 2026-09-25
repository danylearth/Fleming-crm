interface ClientProperty {
  landlord_id: number | null;
  status?: string;
  service_type?: string | null;
  has_live_tenancy?: number | boolean;
}

export function clientPropertyStats(properties: ClientProperty[], clientIds: number[]) {
  const clients = new Set(clientIds);
  const live = properties.filter(property => property.landlord_id != null
    && clients.has(property.landlord_id) && property.status !== 'closed');
  const managed = live.filter(property => ['rent_collection', 'full_management'].includes(property.service_type || ''));
  const occupied = managed.filter(property => property.has_live_tenancy === true || property.has_live_tenancy === 1).length;
  return {
    letOnly: live.filter(property => property.service_type === 'let_only').length,
    rentCollection: managed.filter(property => property.service_type === 'rent_collection').length,
    fullManagement: managed.filter(property => property.service_type === 'full_management').length,
    occupied,
    managed: managed.length,
    occupancy: managed.length ? Math.round(occupied / managed.length * 100) : null,
  };
}
