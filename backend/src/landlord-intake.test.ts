import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { landlordIntakePatch, editableLandlordIntakeFields } from './landlord-intake';
import { landlordIntakeSections } from '../../frontend/src/utils/landlordIntakeFields';

it('covers every named input, select and textarea on the public landlord form', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../landlords-subdomain/index.html'), 'utf8');
  const submitted = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map(m => m[1]);
  const shown = landlordIntakeSections.flatMap(s => s.fields.map(f => f.key));
  for (const key of submitted) expect(shown, key).toContain(key);
  for (const section of landlordIntakeSections.filter(s => !s.readonly)) for (const field of section.fields) expect(editableLandlordIntakeFields, field.key).toContain(field.key);
});
it('accepts partial sections without allowing permission evidence or hidden fields to be overwritten', () => {
  expect(landlordIntakePatch({ propertyCity: ' Wolverhampton ', propertyPostcode: 'WV10 9TG' })).toEqual({ propertyCity: 'Wolverhampton', propertyPostcode: 'WV10 9TG' });
  for (const value of [{ marketing_email: 'yes' }, { upload_token: 'secret' }, { propertyCity: {} }, { email: 'invalid' }]) expect(() => landlordIntakePatch(value)).toThrow();
  expect(landlordIntakePatch({ registration_type: 'Sole' })).toEqual({ registration_type: 'Sole' });
});
