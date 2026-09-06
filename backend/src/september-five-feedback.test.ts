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
const apiHook = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/hooks/useApi.ts'), 'utf8');
const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/0008_september_five_feedback.sql'), 'utf8');

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
  });

  it('supports editable recurring expenses with receipt evidence and financial-year views', () => {
    expect(database).toContain('is_recurring INTEGER DEFAULT 0');
    expect(backend).toContain("app.put('/api/property-expenses/:id'");
    expect(backend).toContain("app.post('/api/property-expenses/:id/receipt'");
    expect(propertyExpenses).toContain('Running Costs');
    expect(propertyExpenses).toContain('Historic Costs');
    expect(propertyExpenses).toContain('Financial year');
    expect(propertyExpenses).toContain('Refurbishment');
  });

  it('labels tenancy information, keeps history, and verifies tenancy removal', () => {
    expect(propertyDetail).toContain('Tenancy Information');
    expect(propertyDetail).toContain('Previous Tenancies');
    expect(propertyDetail).toContain('End the current tenancy');
    expect(propertyDetail).not.toContain('<SectionHeader title="Current Tenancy"');
  });

  it('uses section-aware browser titles and a pound icon', () => {
    expect(layout).toContain('document.title = `Fleming Lettings – ${title || section}`');
    expect(icons).toContain('aria-label="British pound"');
  });

  it('guards the team route and user administration with the admin role', () => {
    expect(app).toContain('<AdminRoute><Users /></AdminRoute>');
    expect(backend).toContain("app.put('/api/users/:id', authMiddleware, requireRole('admin')");
  });

  it('creates linked maintenance requests from a tenant and refreshes fresh data after actions', () => {
    expect(tenantDetail).toContain('Add Request');
    expect(tenantDetail).toContain("tenant_id: tenant.id");
    expect(backend).toContain("'pending','maintenance',$4,CURRENT_DATE,'maintenance'");
    expect(apiHook).toContain('return request(endpoint)');
  });

  it('migrates confirmed portfolio facts without deleting the source notes', () => {
    expect(migration).toContain("LOWER(address) LIKE '16 vine close%'");
    expect(migration).toContain("LOWER(name) = 'dawn harker'");
    expect(migration).toContain("landlord.landlord_type = 'internal'");
    expect(migration).toContain("'Annual service charge'");
    expect(migration).toContain("'Refurbishment'");
    expect(migration).not.toContain('DELETE FROM properties');
  });
});
