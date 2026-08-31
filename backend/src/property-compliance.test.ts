import { describe, expect, it } from 'vitest';
import { propertyCompliance } from './property-compliance';

const today = new Date('2026-08-31T12:00:00Z');

describe('property compliance before issuing a tenancy agreement', () => {
  it('requires current EPC and EICR documents for a property without gas', () => {
    const result = propertyCompliance({
      has_gas: false,
      epc_expiry_date: '2027-01-01',
      eicr_expiry_date: '2027-02-01',
      documents: [{ doc_type: 'EPC' }, { doc_type: 'EICR' }],
    }, today);

    expect(result.ready).toBe(true);
    expect(result.items.map(item => item.docType)).toEqual(['EPC', 'EICR']);
  });

  it('also requires a current gas certificate when the property has gas', () => {
    const result = propertyCompliance({
      has_gas: true,
      epc_expiry_date: '2027-01-01',
      eicr_expiry_date: '2027-02-01',
      gas_safety_expiry_date: '2027-03-01',
      documents: [{ doc_type: 'EPC' }, { doc_type: 'EICR' }],
    }, today);

    expect(result.ready).toBe(false);
    expect(result.items.at(-1)?.reason).toBe('Gas Safety certificate document is missing');
  });

  it('blocks an expired certificate even when its document is uploaded', () => {
    const result = propertyCompliance({
      has_gas: false,
      epc_expiry_date: '2026-08-30',
      eicr_expiry_date: '2027-02-01',
      documents: [{ doc_type: 'EPC' }, { doc_type: 'EICR' }],
    }, today);

    expect(result.ready).toBe(false);
    expect(result.items[0].reason).toBe('EPC has expired');
  });
});
