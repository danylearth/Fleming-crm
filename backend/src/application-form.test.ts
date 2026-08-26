import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const formHtml = fs.readFileSync(path.resolve(__dirname, '../../tenants-subdomain/application.html'), 'utf8');

describe('tenant application form feedback', () => {
  it('uses free-text addresses without loading Google Places', () => {
    expect(formHtml).not.toContain('maps.googleapis.com');
    expect(formHtml).not.toContain('google.maps.places');
    expect(formHtml).toContain('id="f_address_line_1"');
  });

  it('supports draft resume, conditional joint applications, and self-employed routes', () => {
    expect(formHtml).toContain('Save &amp; finish later');
    expect(formHtml).toContain('/draft`');
    expect(formHtml).toContain('id="f_has_joint_applicants"');
    expect(formHtml).toContain('value="sole_trader"');
    expect(formHtml).toContain('value="contractor"');
    expect(formHtml).toContain('value="limited_company"');
  });

  it('provides Yes and No buttons and multiple document uploads', () => {
    expect(formHtml).toContain('class="choice-group"');
    expect(formHtml.match(/type="file"[^>]*multiple/g)?.length).toBeGreaterThanOrEqual(5);
    expect(formHtml).toContain("uploadLabel.textContent = matchingDocuments.length ? '+ Add another' : 'Choose files'");
  });

  it('implements the 26 August conditional questions and mandatory signature', () => {
    for (const id of ['f_has_loans', 'f_has_credit_cards', 'f_has_personal_ref', 'f_has_other_occupants', 'f_has_pets', 'f_generate_signature']) {
      expect(formHtml).toContain(`id="${id}"`);
    }
    expect(formHtml).toContain('Please add or generate your signature.');
    expect(formHtml).not.toContain('Optional drawn signature');
    expect(formHtml).not.toContain('updatePreviousAddressRequirement()');
    expect(formHtml).toContain("['Private tenant', 'Housing association tenant', 'Council tenant']");
  });

  it('formats stored dates and bank details safely', () => {
    expect(formHtml).toContain("match(/^(\\d{4})-(\\d{2})-(\\d{2})/)");
    expect(formHtml).toContain('oninput="formatSortCode(this)"');
    expect(formHtml).toContain('maxlength="8" pattern="\\d{8}"');
  });
});
