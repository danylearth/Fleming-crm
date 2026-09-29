import { Input } from './ui';
export const validServiceFees = (service: string, setup: string, monthly: string) => [setup, ...(service === 'let_only' ? [] : [monthly])].every(value => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100);
export default function ServiceFeeFields({service,setup,monthly,onChange}:{service:string;setup:string;monthly:string;onChange:(fees:{service_setup_fee?:string;service_monthly_fee?:string})=>void}) {
  if (!service) return null;
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Input label="Fee (% of First Month’s Rent) *" type="number" value={setup} onChange={value=>onChange({service_setup_fee:value})} placeholder="e.g. 75"/>{service!=='let_only'&&<Input label="Ongoing Fee (% of Rent) *" type="number" value={monthly} onChange={value=>onChange({service_monthly_fee:value})} placeholder="e.g. 10"/>}<p className="text-xs text-[var(--text-muted)] sm:col-span-2">These percentages populate the service agreement. Enter 0 if no fee is agreed.</p></div>;
}
