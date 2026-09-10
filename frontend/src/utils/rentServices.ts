interface RentalProperty { status?: string; landlord_type?: string; service_type?: string; rent_amount?: number | string; active_monthly_rent?: number | string }
export function rentServiceGroups(properties: RentalProperty[]) {
  const groups: Record<string, { count: number; rent: number }> = {
    'Let Only Service': { count: 0, rent: 0 },
    'Rent Collection Service': { count: 0, rent: 0 },
    'Full Management Service': { count: 0, rent: 0 },
  };
  for (const p of properties) {
    if (p.landlord_type !== 'external' || !['let','let_agreed'].includes(p.status || '')) continue;
    const label = p.service_type === 'let_only' ? 'Let Only Service' : p.service_type === 'rent_collection' ? 'Rent Collection Service' : p.service_type === 'full_management' ? 'Full Management Service' : null;
    if (!label || (p.status !== 'let' && p.service_type !== 'let_only')) continue;
    groups[label].count++;
    groups[label].rent += Number(p.active_monthly_rent ?? p.rent_amount ?? 0);
  }
  return groups;
}
