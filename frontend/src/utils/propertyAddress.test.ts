import { describe, expect, it } from 'vitest';
import { formatPropertyAddress, formatCardAddress } from './propertyAddress';

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

describe('formatCardAddress',()=>{
  it('shows only the house number and postcode, including embedded postcodes',()=>{
    expect(formatCardAddress('8 High Street, Wolverhampton, WV10 8UL','WV10 8UL')).toBe('8 - WV10 8UL');
    expect(formatCardAddress('24 Example Gardens','wv109tg')).toBe('24 - WV10 9TG');
    expect(formatCardAddress('12 Sample Close, Wolverhampton, WV10 9TG')).toBe('12 - WV10 9TG');
  });
  it('preserves building names, number suffixes and flat identification',()=>{
    expect(formatCardAddress('Rose Cottage, High Street, Wolverhampton','WV10 8UL')).toBe('Rose Cottage - WV10 8UL');
    expect(formatCardAddress('8A High Street','WV10 8UL')).toBe('8A - WV10 8UL');
    expect(formatCardAddress('8-10 High Street','WV10 8UL')).toBe('8-10 - WV10 8UL');
    expect(formatCardAddress('Flat 2, 8 High Street','WV10 8UL')).toBe('Flat 2, 8 - WV10 8UL');
    expect(formatCardAddress(null,'WV10 8UL')).toBe('WV10 8UL');
  });
});
