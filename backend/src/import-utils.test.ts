import { describe, expect, it } from 'vitest';
import { coerceImportValue } from './import-utils';

describe('coerceImportValue', () => {
  it('normalizes valid currency and landlord entity types', () => {
    expect(coerceImportValue('rent_amount', '£1,450.50')).toEqual({ value: 1450.5 });
    expect(coerceImportValue('entity_type', ' Company ')).toEqual({ value: 'company' });
  });

  it('rejects impossible dates instead of sending them to Postgres', () => {
    expect(coerceImportValue('date_of_birth_1', '2026-99-99')).toEqual({
      value: null,
      error: 'invalid date_of_birth_1',
    });
  });

  it('rejects fractional or non-positive bedroom counts', () => {
    expect(coerceImportValue('bedrooms', '2.5').error).toBe('invalid bedrooms');
    expect(coerceImportValue('bedrooms', '0').error).toBe('invalid bedrooms');
  });

  it('rejects unknown landlord entity types', () => {
    expect(coerceImportValue('entity_type', 'partnership')).toEqual({
      value: null,
      error: 'invalid entity_type',
    });
  });
});
