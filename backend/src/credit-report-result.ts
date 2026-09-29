const ratings = ['VERY_POOR', 'POOR', 'FAIR', 'GOOD', 'EXCELLENT'];
export function isValidManualCreditScore(value:unknown):boolean {
  return (typeof value==='string'||typeof value==='number')&&/^\d+$/.test(String(value).trim())&&Number.isSafeInteger(Number(value));
}
export function creditReportResult(raw: unknown, score = '') {
  const input = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  if (typeof input !== 'object' || Array.isArray(input) || input === null) throw Error('Invalid credit report details');
  const value = input as Record<string, unknown>;
  const result: Record<string, string | number | boolean | null> = {};
  for (const key of ['provider', 'reference', 'score']) {
    const entry = key === 'score' ? score || value[key] : value[key];
    if (entry !== undefined && entry !== null && String(entry).trim()) {
      if (typeof entry !== 'string' && typeof entry !== 'number') throw Error(`Invalid ${key}`);
      if (String(entry).length > 200) throw Error(`${key} is too long`);
      result[key] = String(entry).trim();
    }
  }
  if(value.report_date){const date=String(value.report_date);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Invalid report date');result.report_date=date;}
  if (value.rating) {
    const rating = String(value.rating).toUpperCase().replace(/ /g, '_');
    if (!ratings.includes(rating)) throw Error('Invalid credit rating');
    result.rating = rating;
  }
  for (const key of ['active_ccjs', 'satisfied_ccjs', 'active_ccj_value', 'satisfied_ccj_value', 'insolvencies']) {
    const entry = value[key];
    if (entry === undefined || entry === null || (typeof entry === 'string' && !entry.trim())) continue;
    const number = Number(entry);
    if ((typeof entry !== 'number' && typeof entry !== 'string') || !Number.isFinite(number) || number < 0 || (!key.endsWith('_value') && !Number.isSafeInteger(number))) throw Error(`Invalid ${key}`);
    result[key] = number;
  }
  if (value.bankruptcy !== undefined && value.bankruptcy !== null && value.bankruptcy !== '') {
    if (typeof value.bankruptcy !== 'boolean') throw Error('Invalid bankruptcy status');
    result.bankruptcy = value.bankruptcy;
  }
  return result;
}
