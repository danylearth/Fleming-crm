import { describe, expect, it } from 'vitest';
import { serviceSigningUrl, parseServiceSigningSlug } from './service-agreement-links';

describe('service agreement links', () => {
  const agreement = { id: 1, token: 'abcdef01'.repeat(8), details: { landlord_name: 'Marie Ellis', property_address: '12 Frankford Road, Dudley, DY6 7HU' } };
  it('uses a readable unique contract address with a 128-bit access code', () => {
    const url = serviceSigningUrl(agreement);
    expect(url).toMatch(/^https:\/\/apply.fleminglettings.co.uk\/marie-ellis-12-dy67hu-contract1-[A-Za-z0-9_-]{22}$/);
    expect(parseServiceSigningSlug(new URL(url).pathname)).toEqual({id:1,tokenPrefix:agreement.token.slice(0,32)});
    expect(serviceSigningUrl({...agreement,id:2})).not.toBe(url);
  });
  it('does not accept a guessed name or contract number without the access code', () => {
    expect(parseServiceSigningSlug('marie-ellis-12-dy67hu-contract1')).toBeNull();
    expect(parseServiceSigningSlug('marie-ellis-12-dy67hu-contract1-short')).toBeNull();
  });
  it('retains nonstandard legacy token links', () => {
    expect(serviceSigningUrl({...agreement,token:'legacy'})).toBe('https://apply.fleminglettings.co.uk/service-agreement.html?token=legacy');
  });
});
