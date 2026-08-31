import { describe, expect, it } from 'vitest';
import { formatPropertyAddress } from './propertyAddress';

describe('formatPropertyAddress', () => {
  it('does not duplicate a postcode already included in the address', () => {
    expect(formatPropertyAddress('10 High Street, WV10 9TG', 'WV10 9TG')).toBe('10 High Street, WV10 9TG');
  });

  it('appends a separate postcode once', () => {
    expect(formatPropertyAddress('10 High Street', 'WV10 9TG')).toBe('10 High Street, WV10 9TG');
  });
});
