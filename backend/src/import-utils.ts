export interface ImportValueResult {
  value: string | number | null;
  error?: string;
}

const NON_NEGATIVE_NUMBERS = new Set(['income_1', 'rent_amount']);

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function coerceImportValue(column: string, raw: unknown): ImportValueResult {
  const value = typeof raw === 'string' ? raw.trim() : raw;
  if (value === undefined || value === null || value === '') return { value: null };

  if (column === 'bedrooms') {
    const number = Number(String(value).replace(/,/g, ''));
    return Number.isInteger(number) && number > 0
      ? { value: number }
      : { value: null, error: 'invalid bedrooms' };
  }

  if (NON_NEGATIVE_NUMBERS.has(column)) {
    const normalized = String(value).replace(/[£,]/g, '');
    const number = Number(normalized);
    return Number.isFinite(number) && number >= 0
      ? { value: number }
      : { value: null, error: `invalid ${column}` };
  }

  if (column === 'date_of_birth_1') {
    const date = String(value).slice(0, 10);
    return isIsoDate(date)
      ? { value: date }
      : { value: null, error: 'invalid date_of_birth_1' };
  }

  if (column === 'entity_type') {
    const entityType = String(value).toLowerCase();
    return ['individual', 'company', 'trust'].includes(entityType)
      ? { value: entityType }
      : { value: null, error: 'invalid entity_type' };
  }

  return { value: String(value) };
}
