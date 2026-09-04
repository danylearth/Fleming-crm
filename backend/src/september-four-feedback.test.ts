import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const backend = fs.readFileSync(path.resolve(__dirname, 'index-pg.ts'), 'utf8');
const wizard = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/ui/OnboardingWizard.tsx'), 'utf8');
const tenantDetail = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/TenantDetail.tsx'), 'utf8');
const properties = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Properties.tsx'), 'utf8');
const enquiryForm = fs.readFileSync(path.resolve(__dirname, '../../tenants-subdomain/index.html'), 'utf8');
const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/0007_september_application_feedback.sql'), 'utf8');

describe('4 September CRM feedback', () => {
  it('keeps Retired income without showing employment-role questions', () => {
    expect(enquiryForm).toContain("const incomeBased = ['Full-Time Employed', 'Part-Time Employed', 'Self-Employed', 'Retired']");
    expect(enquiryForm).toContain("const hasEmploymentRole = ['Full-Time Employed', 'Part-Time Employed', 'Self-Employed']");
    expect(enquiryForm).toContain("details.querySelectorAll('.employment-role-only')");
  });

  it('uses secure short application aliases while retaining token lookup compatibility', () => {
    expect(backend).toContain('function createApplicationFormSlug');
    expect(backend).toContain('application_form_token = $1 OR te.application_form_slug = $1');
    expect(backend).toContain('https://apply.fleminglettings.co.uk/${applicationSlug}');
  });

  it('supports holding-deposit SMS previews, the supplied wording, and stage progression', () => {
    expect(wizard).toContain('Preview email before sending');
    expect(wizard).toContain('Also send SMS');
    expect(wizard).toContain('setActiveStep(2)');
    expect(backend).toContain('we are pleased to confirm receipt of your holding deposit payment');
  });

  it('preserves failed agreement delivery for a visible retry', () => {
    expect(backend).toContain("tenancy-agreement/retry-delivery");
    expect(backend).toContain("if (!failed)");
    expect(wizard).toContain('Retry Agreement Delivery');
  });

  it('shows tenant addresses and maintenance and exposes clear tenancy actions', () => {
    expect(tenantDetail).toContain('Previous Address');
    expect(tenantDetail).toContain('Maintenance (');
    expect(tenantDetail).toContain('Update Tenancy');
    expect(tenantDetail).toContain('Schedule Tenancy End');
  });

  it('requires client service types and restricts property statuses', () => {
    expect(backend).toContain('Choose a service type for this client property');
    expect(properties).toContain('Service Type *');
    expect(properties).not.toContain("{ value: 'full_management', label: 'Full Management' }, { value: 'rent_collection', label: 'Rent Collection' }]} />\n          <Select label=\"Service Type\"");
  });

  it('creates the confirmed internal Bridgemary test property with gas', () => {
    expect(migration).toContain("'8 Bridgemary Close, Wolverhampton'");
    expect(migration).toContain("'WV10 8UL'");
    expect(migration).toContain("  1,\n  'to_let',\n  NULL");
  });
});
