export function tenancyDuration(start: string | null | undefined, end?: string | null, today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London'}).format(new Date())): string | null {
  if (!start) return null;
  const from = start.slice(0, 10), until = end && end.slice(0, 10) < today ? end.slice(0, 10) : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(Date.parse(from))) return null;
  if (from > until) return 'Not started yet';
  const [year, month, day] = from.split('-').map(Number);
  const [endYear, endMonth, endDay] = until.split('-').map(Number);
  let months = (endYear - year) * 12 + endMonth - month;
  const anniversaryDay = Math.min(day, new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate());
  if (endDay < anniversaryDay) months--;
  if (months < 1) return 'Less than 1 month';
  const years = Math.floor(months / 12), remainder = months % 12;
  return [years ? `${years} year${years === 1 ? '' : 's'}` : '', remainder ? `${remainder} month${remainder === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
}
