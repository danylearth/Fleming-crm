import { describe, expect, it } from 'vitest';
import { getPropertyImage, getPropertyPlaceholder, propertyCardColours } from './propertyImages';

describe('property image fallbacks', () => {
  it('reserves purple for owned properties and cycles client colours by landlord', () => {
    const properties = [
      {id:1,landlord_id:1,landlord_type:'internal'},
      {id:2,landlord_id:1,landlord_type:'internal'},
      ...Array.from({length:7},(_,index)=>({id:index+3,landlord_id:index+2,landlord_type:'external'})),
      {id:99,landlord_id:2,landlord_type:'external'},
    ];
    const colours=propertyCardColours(properties);
    expect(colours.get(1)).toBe('#7e22ce');
    expect(colours.get(2)).toBe(colours.get(1));
    expect(colours.get(3)).toBe('#15803d');
    expect(colours.get(99)).toBe(colours.get(3));
    expect(new Set(properties.slice(2,8).map(p=>colours.get(p.id))).size).toBe(6);
    expect(colours.get(9)).toBe(colours.get(3));
    const reordered=propertyCardColours([...properties].reverse());
    for(const property of properties)expect(reordered.get(property.id)).toBe(colours.get(property.id));
  });
  it('keeps the same landlord colour across properties and name changes', () => {
    const colour = (image: string) => decodeURIComponent(image).match(/<rect[^>]+fill="([^"]+)"/)?.[1];
    expect(colour(getPropertyPlaceholder(12, 400, 240, 'Peter Smith', 7)))
      .toBe(colour(getPropertyPlaceholder(99, 1200, 400, 'Peter J Smith', 7)));
  });

  it('normalises landlord names when an ID is unavailable', () => {
    expect(getPropertyPlaceholder(12, 400, 240, 'Peter Smith'))
      .toBe(getPropertyPlaceholder(99, 400, 240, '  peter   smith  '));
  });

  it('shows coloured landlord initials when there is no photo or Street View key', () => {
    const image = decodeURIComponent(getPropertyImage(12, 400, 240, undefined, null, 'Peter Smith'));

    expect(image).toContain('<rect width="100%" height="100%"');
    expect(image).toContain('>PS</text>');
    expect(image).not.toContain('<path');
  });

  it('uses the same initials fallback after an external image fails', () => {
    const image = decodeURIComponent(getPropertyPlaceholder(12, 400, 240, 'Fleming Lettings'));

    expect(image).toContain('>FL</text>');
  });
});
