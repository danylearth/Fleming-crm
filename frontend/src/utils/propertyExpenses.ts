export function ukFinancialYear(date: string | null | undefined) {
  if (!date) return 'undated';
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'undated';
  const beforeTaxYear = parsed.getMonth() < 3 || (parsed.getMonth() === 3 && parsed.getDate() < 6);
  const start = beforeTaxYear ? parsed.getFullYear() - 1 : parsed.getFullYear();
  return `${start}-${start + 1}`;
}

export function isUkFinancialYearToDate(date: string | null | undefined, now = new Date()) {
  if (!date) return false;
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return !Number.isNaN(parsed.getTime())
    && ukFinancialYear(date) === ukFinancialYear(today)
    && date.slice(0, 10) <= today;
}
