import { describe, expect, it } from 'vitest';
import { isUkFinancialYearToDate, ukFinancialYear } from './propertyExpenses';

describe('property expense reporting', () => {
  it('uses the UK 6 April financial-year boundary', () => {
    expect(ukFinancialYear('2026-04-05')).toBe('2025-2026');
    expect(ukFinancialYear('2026-04-06')).toBe('2026-2027');
  });

  it('counts only current financial-year expenses up to today as YTD', () => {
    const now = new Date('2026-09-06T12:00:00');
    expect(isUkFinancialYearToDate('2026-04-06', now)).toBe(true);
    expect(isUkFinancialYearToDate('2026-09-07', now)).toBe(false);
    expect(isUkFinancialYearToDate('2026-04-05', now)).toBe(false);
  });
});
