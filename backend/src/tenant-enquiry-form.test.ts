import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const formHtml = fs.readFileSync(path.resolve(__dirname, '../../tenants-subdomain/index.html'), 'utf8');

describe('tenant enquiry form feedback', () => {
  it('offers Retired and requires annual income for income-based statuses', () => {
    expect(formHtml.match(/<option value="Retired">Retired<\/option>/g)?.length).toBe(2);
    expect(formHtml.match(/Annual Income \(&pound;\)|Annual Income \(£\)/g)?.length).toBe(2);
    expect(formHtml).toContain("['Full-Time Employed', 'Part-Time Employed', 'Self-Employed', 'Retired']");
  });

  it('supports multiple property type selections', () => {
    expect(formHtml.match(/type="checkbox" name="typeofproperty"/g)?.length).toBe(6);
    expect(formHtml).toContain("formData.getAll('typeofproperty')");
  });

  it('validates emails and UK mobile numbers before advancing', () => {
    expect(formHtml).toContain('!input.checkValidity()');
    expect(formHtml).toContain('function isValidUkMobile(value)');
    expect(formHtml).toContain('Enter a valid email address for the second applicant.');
    expect(formHtml).toContain('Enter a valid UK mobile number');
  });
});
