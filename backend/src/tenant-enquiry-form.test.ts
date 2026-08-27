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
    expect(formHtml).toContain('Please enter a valid email address.');
    expect(formHtml).toContain('Please enter a valid email address for the second applicant.');
    expect(formHtml).toContain('Enter a valid UK mobile number');
  });

  it('requires job title and annual income for applicable employment statuses', () => {
    expect(formHtml).toContain('if (jobTitle) jobTitle.required = employed');
    expect(formHtml).toContain('if (annualIncome) annualIncome.required = employed');
  });

  it('checks duplicates using email only and uses the CRM favicon', () => {
    expect(formHtml).toContain('new URLSearchParams({ email: data.form_email })');
    expect(formHtml).not.toContain('new URLSearchParams({ email: data.form_email, phone:');
    expect(formHtml).toContain('crm.fleminglettings.co.uk/logo-icon.png');
  });
});
