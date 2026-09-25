import { describe, expect, it } from 'vitest';
import { formatPropertyAddress } from './propertyAddress';

describe('formatPropertyAddress', () => {
  it('does not duplicate a postcode already included in the address', () => {
    expect(formatPropertyAddress('10 High Street, WV10 9TG', 'WV10 9TG')).toBe('10 High Street, WV10 9TG');
  });

  it('appends a separate postcode once', () => {
    expect(formatPropertyAddress('10 High Street', 'WV10 9TG')).toBe('10 High Street, WV10 9TG');
  });
  it('includes a separate town and postcode in the right order', () => {
    expect(formatPropertyAddress('12 Frankford Road', 'DY6 7HU', 'Kingswinford')).toBe('12 Frankford Road, Kingswinford, DY6 7HU');
    expect(formatPropertyAddress('12 Frankford Road, DY6 7HU', 'DY6 7HU', 'Kingswinford')).toBe('12 Frankford Road, Kingswinford, DY6 7HU');
  });
  it('does not repeat a town or postcode already in the address', () => {
    expect(formatPropertyAddress('16 Vine Close, Wolverhampton, WV10 6NG', 'WV10 6NG', 'Wolverhampton')).toBe('16 Vine Close, Wolverhampton, WV10 6NG');
  });
});
