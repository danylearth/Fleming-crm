import { describe, expect, it } from 'vitest';
import { dueDateForPayment, matchDeposit, matchExpense, matchRent } from './bank-feed';

describe('bank feed matching', () => {
  it('matches a unique rent credit only when amount and tenant name agree', () => {
    const result = matchRent({ transaction_id: '1', timestamp: '2026-09-02', amount: 875, description: 'TARA OHANLON RENT' }, [
      { tenantId: 1, propertyId: 4, tenancyId: 7, tenantName: "Tara O'Hanlon", propertyAddress: '4A Cavalier Circus', postcode: 'WV10 8TR', rentAmount: 875 },
      { tenantId: 2, propertyId: 8, tenancyId: 9, tenantName: 'Another Tenant', propertyAddress: '8 Other Street', postcode: 'WV10 9AA', rentAmount: 875 },
    ]);
    expect(result?.tenantId).toBe(1);
  });

  it('does not guess when only the amount agrees', () => {
    const result = matchRent({ transaction_id: '1', timestamp: '2026-09-02', amount: 875, description: 'TRANSFER' }, [
      { tenantId: 1, propertyId: 4, tenancyId: 7, tenantName: 'Tara Ohanlon', propertyAddress: '4A Cavalier Circus', postcode: 'WV10 8TR', rentAmount: 875 },
    ]);
    expect(result).toBeNull();
  });

  it('matches an expense only to a unique property reference', () => {
    const result = matchExpense({ transaction_id: '2', timestamp: '2026-09-02', amount: -120, description: 'REPAIR 4A CAVALIER CIRCUS' }, [
      { propertyId: 4, address: '4A Cavalier Circus, Wolverhampton', postcode: 'WV10 8TR' },
      { propertyId: 5, address: '99 Ringwood Road, Wolverhampton', postcode: 'WV10 9ER' },
    ]);
    expect(result?.propertyId).toBe(4);
  });

  it('matches a holding deposit by unique amount and applicant name', () => {
    const result = matchDeposit({ transaction_id: '3', timestamp: '2026-09-02', amount: 201.92, description: 'TARA OHANLON HOLDING' }, [
      { enquiryId: 12, propertyId: 4, name: "Tara O'Hanlon", amount: 201.92 },
    ]);
    expect(result?.enquiryId).toBe(12);
  });

  it('uses the tenancy anniversary day for the payment month', () => {
    expect(dueDateForPayment('2026-01-31', '2026-02-10T09:00:00Z')).toBe('2026-02-28');
  });
});
