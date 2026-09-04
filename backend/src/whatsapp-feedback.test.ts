import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const apiSource = fs.readFileSync(path.resolve(__dirname, 'index-pg.ts'), 'utf8');
const wizardSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/ui/OnboardingWizard.tsx'), 'utf8');
const tenantDetailSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/TenantDetail.tsx'), 'utf8');
const propertyDetailSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PropertyDetail.tsx'), 'utf8');
const dashboardSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/Dashboard.tsx'), 'utf8');
const enquiryDetailSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/EnquiryDetail.tsx'), 'utf8');
const propertyImagesSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/propertyImages.ts'), 'utf8');

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

  it('generates the tenancy agreement automatically and enforces landlord-first client signing', () => {
    expect(apiSource).toContain('generateTenancyAgreementPdf');
    expect(apiSource).toContain('resolvePaymentRoute');
    expect(apiSource).toContain('The landlord must sign before the tenant');
    expect(apiSource).toContain('sendTenantAgreementDelivery');
  });

  it('requires an explicit gas-connection answer for every new property', () => {
    expect(apiSource).toContain("typeof d.has_gas !== 'boolean'");
    expect(apiSource).toContain('Confirm whether the property has a gas connection');
  });

  it('requires rejection instructions and records privacy-safe form click events', () => {
    expect(apiSource).toContain('Describe the changes or information required before rejecting a document');
    expect(apiSource).toContain("action, entity_type, entity_id, changes, ip_address");
    expect(apiSource).toContain("'application_form_click'");
    expect(apiSource).not.toContain('req.body?.field_value');
  });

  it('requires every joint tenant to sign the same agreement', () => {
    expect(apiSource).toContain('requires_joint_tenant_signature');
    expect(apiSource).toContain('joint_tenant_token');
    expect(apiSource).toContain("role !== 'landlord'");
    expect(apiSource).toContain('Both joint applicants must complete application review and credit checks');
  });

  it('provides the requested tenancy agreement controls and missing-document route', () => {
    expect(wizardSource).toContain('Tenancy Agreement for Fleming Lettings Properties');
    expect(wizardSource).not.toMatch(/\bAST\b/);
    expect(wizardSource).toContain('Click to add document');
    expect(wizardSource).toContain('Upload Credit Report *');
    expect(wizardSource).toContain('Editable tenant email preview');
    expect(wizardSource).toContain('<DatePicker label="Tenancy start *"');
  });

  it('wires the tenancy email templates to signing, completion and final balance', () => {
    expect(apiSource).toContain('tenancyAgreementEmail({');
    expect(apiSource).toContain('completedTenancyAgreementEmail(');
    expect(apiSource).toContain("template, body_html, status, error_message)");
    expect(apiSource).toContain("'completed_tenancy_agreement'");
    expect(apiSource).toContain('finalBalanceHandoverEmail({');
    expect(apiSource).toContain('agreement_details');
  });

  it('wires the September handover and tenant maintenance feedback', () => {
    expect(apiSource).toContain('handoverAppointmentEmail({');
    expect(apiSource).toContain("app.post('/api/public/maintenance-report'");
    expect(apiSource).toContain("'maintenance',$4,CURRENT_DATE,'maintenance'");
    expect(apiSource).toContain('handover_with_landlord');
    expect(wizardSource).toContain('With Landlord');
    expect(wizardSource).toContain('Editable SMS preview');
  });

  it('shows completed payment and credit report evidence without another upload prompt', () => {
    expect(wizardSource).toContain('balance_payment_received_at');
    expect(wizardSource).toContain('creditReportDocument.original_name');
    expect(wizardSource).toContain('downloadDocument(creditReportDocument.id');
  });

  it('provides linked, scrollable notes and hides finished onboarding checklists', () => {
    expect(tenantDetailSource).toContain("notesFilter === 'property'");
    expect(tenantDetailSource).toContain("form.status === 'onboarding' && !isOnboarded");
    expect(enquiryDetailSource).toContain("form.status !== 'converted' && <GlassCard");
    expect(enquiryDetailSource).toContain('docType="Credit Check Report"');
    expect(propertyDetailSource).toContain("notesFilter.startsWith('tenant-')");
    expect(propertyDetailSource).toContain('max-h-64 overflow-y-auto');
  });

  it('allows dashboard reminders to be deleted and uploaded property photos to become thumbnails', () => {
    expect(dashboardSource).toContain("api.delete(`/api/tasks/${task.id}`)");
    expect(dashboardSource).toContain('getPropertyPlaceholder(prop.id, 400, 240, prop.landlord_name)');
    expect(propertyImagesSource).toContain('landlordInitials(landlordName)');
    expect(apiSource).toContain("doc_type='Property Photo'");
    expect(apiSource).toContain("app.get('/api/public/properties/:id/thumbnail'");
  });
});
