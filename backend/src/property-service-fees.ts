export function propertyServiceFees(service: string | null, setup: unknown, monthly: unknown) {
  if (!service) return { service_setup_fee: null, service_monthly_fee: null };
  if (!['let_only', 'rent_collection', 'full_management'].includes(service)) throw new Error('Choose a valid service type');
  const percent = (value: unknown, label: string) => {
    if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) throw new Error(`Enter ${label} between 0 and 100 percent`);
    return Number(value);
  };
  return { service_setup_fee: percent(setup, 'the first month’s rent fee'), service_monthly_fee: service === 'let_only' ? 0 : percent(monthly, 'the ongoing rent fee') };
}
