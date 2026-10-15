import {describe,expect,it} from 'vitest';
import {normalizePropertyAddress} from './property-address';

describe('property postcode formatting',()=>{
  const address='99 Ringwood Road, Wolverhampton, WV10 9ER';
  it.each([address,address+', WV10 9ER',address+', WV109ER, WV10 9ER'])('removes repeated trailing postcodes from %s',input=>{
    expect(normalizePropertyAddress(input)).toBe(address);
    expect(normalizePropertyAddress(input,'WV10 9ER','Wolverhampton')).toBe(address);
  });
  it('adds the city and postcode once',()=>{
    expect(normalizePropertyAddress('99 Ringwood Road, WV10 9ER','WV10 9ER','Wolverhampton')).toBe(address);
    expect(normalizePropertyAddress('99 Ringwood Road','WV10 9ER','Wolverhampton')).toBe(address);
  });
  it('does not merge different properties or postcodes',()=>{
    expect(normalizePropertyAddress('98 Ringwood Road, WV10 9ER')).not.toBe(normalizePropertyAddress('99 Ringwood Road, WV10 9ER'));
    expect(normalizePropertyAddress('99 Ringwood Road, WV10 9ES')).not.toBe(normalizePropertyAddress('99 Ringwood Road, WV10 9ER'));
  });
});
