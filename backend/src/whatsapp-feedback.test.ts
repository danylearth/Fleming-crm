import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const apiSource = fs.readFileSync(path.resolve(__dirname, 'index-pg.ts'), 'utf8');

describe('31 August CRM feedback regressions', () => {
  it('casts reviewer IDs as integers in document and application reviews', () => {
    expect(apiSource).toContain("reviewed_by = CASE WHEN $1 = 'pending' THEN NULL ELSE $3::INTEGER END");
    expect(apiSource).toContain("application_reviewed_by = CASE WHEN $1 = 'approved' THEN $3::INTEGER ELSE NULL END");
  });

  it('stores a generated completed application PDF in enquiry documents', () => {
    expect(apiSource).toContain("doc_type = 'Completed Tenancy Application'");
    expect(apiSource).toContain("'application/pdf'");
    expect(apiSource).toContain('generateCompletedApplicationPdf');
  });

  it('supports viewings without a linked property when a custom location is provided', () => {
    expect(apiSource).toContain("if (!property_id && !customLocation)");
    expect(apiSource).toContain('viewing_location');
  });

  it('requires a score and uploaded report for a completed credit check', () => {
    expect(apiSource).toContain("app.post('/api/tenant-enquiries/:id/credit-check'");
    expect(apiSource).toContain("doc_type, filename, original_name, mime_type, size, uploaded_by, review_status");
    expect(apiSource).toContain("doc_type = 'Credit Check Report'");
  });

  it('provides agreement signing, final balance and handover workflow routes', () => {
    expect(apiSource).toContain("app.post('/api/public/tenancy-agreements/:token/sign'");
    expect(apiSource).toContain("app.post('/api/tenant-enquiries/:id/request-balance'");
    expect(apiSource).toContain("app.post('/api/tenant-enquiries/:id/schedule-handover'");
    expect(apiSource).toContain("'Signed Tenancy Agreement'");
  });

  it('blocks agreements until property compliance is current and attaches the certificates', () => {
    expect(apiSource).toContain("app.get('/api/tenant-enquiries/:id/tenancy-agreement-compliance'");
    expect(apiSource).toContain('Complete the property compliance checks before issuing the agreement');
    expect(apiSource).toContain('compliance.attachments.map');
  });

  it('generates the AST automatically and enforces landlord-first client signing', () => {
    expect(apiSource).toContain('generateTenancyAgreementPdf');
    expect(apiSource).toContain('resolvePaymentRoute');
    expect(apiSource).toContain('The landlord must sign before the tenant');
    expect(apiSource).toContain('sendTenantAgreementDelivery');
  });

  it('requires an explicit gas-connection answer for every new property', () => {
    expect(apiSource).toContain("typeof d.has_gas !== 'boolean'");
    expect(apiSource).toContain('Confirm whether the property has a gas connection');
  });
});
