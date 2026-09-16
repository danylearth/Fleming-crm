import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const backend = fs.readFileSync(path.resolve(__dirname, 'index-pg.ts'), 'utf8');
const database = fs.readFileSync(path.resolve(__dirname, 'db-pg.ts'), 'utf8');
const propertyDetail = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PropertyDetail.tsx'), 'utf8');
const propertyExpenses = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/PropertyExpenses.tsx'), 'utf8');
const properties = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Properties.tsx'), 'utf8');
const documents = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/ui/DocumentUpload.tsx'), 'utf8');
const layout = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/Layout.tsx'), 'utf8');
const app = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/App.tsx'), 'utf8');
const icons = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/ui/icons/FlemingIcons.tsx'), 'utf8');
const tenantDetail = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/TenantDetail.tsx'), 'utf8');
const maintenance = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Maintenance.tsx'), 'utf8');
const dashboard = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Dashboard.tsx'), 'utf8');
const apiHook = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/hooks/useApi.ts'), 'utf8');
const onboardingWizard = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/ui/OnboardingWizard.tsx'), 'utf8');
const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/0008_september_five_feedback.sql'), 'utf8');
const credentialsMigration = fs.readFileSync(path.resolve(__dirname, '../migrations/0009_portal_credentials.sql'), 'utf8');

describe('5 September CRM feedback', () => {
  it('keeps postcode spacing for Land Registry Price Paid searches', () => {
    expect(backend).toContain("postcode.replace(/\\s+/g, ' ').trim().toUpperCase()");
    expect(backend).not.toContain("postcode.replace(/\\s/g, '').toUpperCase()");
  });

  it('adds the requested property document types and document filtering', () => {
    for (const type of [
      'Land Registry', 'Legal Documents', 'Solicitors Correspondence',
      'Management Company Correspondence', 'Freeholder Correspondence',
      'Tenant Communications', 'Damage Reports', 'Service Connections',
      'Lease', 'Inventory', 'Signed Tenancy Agreement', 'Credit Report',
      'Employment Reference', 'Proof of Income',
    ]) {
      expect(backend).toContain(`'${type}'`);
    }
    expect(documents).toContain('filterType');
    expect(documents).toContain('Filter documents');
  });

  it('supports structured leasehold and management-company details', () => {
    expect(database).toContain('leasehold_issued_by TEXT');
    expect(database).toContain('has_management_company INTEGER');
    expect(backend).toContain('Confirm whether there is a management company in place');
    expect(properties).toContain('Is there a management company in place? *');
    expect(propertyDetail).toContain('Management Company');
    expect(propertyDetail).toContain('Leasehold Issued By');
    expect(propertyDetail).toContain('Portal Website');
    expect(propertyDetail).toContain('Reveal password');
    expect(credentialsMigration).toContain('leasehold_portal_password_encrypted TEXT');
    expect(credentialsMigration).toContain('management_company_portal_password_encrypted TEXT');
    expect(backend).toContain("requireRole('admin')");
  });

  it('supports editable recurring expenses with receipt evidence and financial-year views', () => {
    expect(database).toContain('is_recurring INTEGER DEFAULT 0');
    expect(backend).toContain("app.put('/api/property-expenses/:id'");
    expect(backend).toContain("app.post('/api/property-expenses/:id/receipt'");
    expect(propertyExpenses).toContain('Service Charges & Ground Rent');
    expect(propertyExpenses).toContain('Historic Costs');
    expect(propertyExpenses).toContain('Financial year');
    expect(propertyExpenses).toContain('Year to date');
    expect(propertyExpenses).toContain('All-time total');
    expect(propertyExpenses).toContain('Refurbishment');
  });

  it('labels tenancy information, keeps history, and verifies tenancy removal', () => {
    expect(propertyDetail).toContain('Tenancy Information');
    expect(propertyDetail).toContain('Previous Tenancies');
    expect(propertyDetail).toContain('<TenancyEndModal');
    expect(propertyDetail).not.toContain('<SectionHeader title="Current Tenancy"');
  });

  it('uses section-aware browser titles and a pound icon', () => {
    expect(layout).toContain('document.title = `Fleming Lettings – ${title || section}`');
    expect(icons).toContain('aria-label="British pound"');
  });

  it('guards the team route and user administration with the admin role', () => {
    expect(app).toContain('<AdminRoute><Users /></AdminRoute>');
    expect(backend).toContain("app.get('/api/users', authMiddleware, requireRole('admin')");
    expect(backend).toContain("app.get('/api/users/options', authMiddleware");
    expect(backend).toContain("app.put('/api/users/:id', authMiddleware, requireRole('admin')");
  });

  it('creates linked maintenance requests from a tenant and refreshes fresh data after actions', () => {
    expect(tenantDetail).toContain('Add Request');
    expect(tenantDetail).toContain('Email Reporting Link');
    expect(tenantDetail).toContain('SMS Reporting Link');
    expect(tenantDetail).toContain("tenant_id: tenant.id");
    expect(backend).toContain("'pending','maintenance',$4,CURRENT_DATE,'maintenance'");
    expect(app).toContain('path="/maintenance/:requestId"');
    expect(maintenance).toContain('setExpanded(requested)');
    expect(dashboard).toContain('navigate(`/maintenance/${item.id}`)');
    expect(apiHook).toContain("window.addEventListener('focus', refresh)");
    expect(apiHook).toContain('DATA_UPDATED_STORAGE_KEY');
  });

  it('hides client-only service filters from My Portfolio', () => {
    expect(properties).toContain("portfolioFilter === 'internal'");
    expect(properties).toContain("!['full_management', 'rent_collection'].includes(status.key)");
    expect(properties).toContain('...visibleStatuses.map');
  });

  it('migrates confirmed portfolio facts without deleting the source notes', () => {
    expect(migration).toContain("LOWER(address) LIKE '16 vine close%'");
    expect(migration).toContain("LOWER(name) = 'dawn harker'");
    expect(migration).toContain("landlord.landlord_type = 'internal'");
    expect(migration).toContain("'Annual service charge'");
    expect(migration).toContain("'Refurbishment'");
    expect(migration).not.toContain('DELETE FROM properties');
  });

  it('uses the current readonly holding-deposit preview and message options', () => {
    expect(onboardingWizard).not.toContain('Editable email message');
    expect(onboardingWizard).toContain('Editable SMS preview');
    expect(onboardingWizard).toContain('previewHoldingEmail');
    expect(onboardingWizard).toContain('Send Email');
    expect(onboardingWizard).toContain('Send SMS');
    expect(backend).toContain('req.body.email_message');
    expect(backend).toContain('req.body.sms_message');
  });

  it('redacts credentials from structured request logs', () => {
    expect(backend).toContain("'req.headers.authorization'");
    expect(backend).toContain("'req.headers.cookie'");
    expect(backend).toContain("'req.headers[\"x-api-key\"]'");
    expect(backend).toContain("censor: '[REDACTED]'");
  });
});
