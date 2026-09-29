import { describe, expect, it } from 'vitest';
import { getPropertyImage, getPropertyPlaceholder } from './propertyImages';

describe('property image fallbacks', () => {
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
