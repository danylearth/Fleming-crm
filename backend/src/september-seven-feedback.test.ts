import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');
const backend = read('index-pg.ts');
const database = read('db-pg.ts') + read('../migrations/0010_existing_tenant_links_and_addresses.sql');
const pdf = read('tenancy-agreement-pdf.ts');
const email = read('email.ts');
const wizard = read('../../frontend/src/components/ui/OnboardingWizard.tsx');
const tenantDetail = read('../../frontend/src/pages/TenantDetail.tsx');
const tenants = read('../../frontend/src/pages/Tenants.tsx');
const signingForm = read('../../tenants-subdomain/agreement.html');
const maintenanceForm = read('../../tenants-subdomain/report.html');
const vercel = JSON.parse(read('../../tenants-subdomain/vercel.json'));

describe('7 September CRM feedback', () => {
  it('uses short, unique applicant-specific APT links and records their latest open time', () => {
    // Link entropy and per-applicant isolation are exercised over HTTP in test:integration.
    expect(backend).toContain("crypto.randomBytes(16).toString('hex')");
    expect(backend).toContain('agreement.tenant_slug || agreement.tenant_token');
    expect(backend).toContain('SET ${role}_opened_at = NOW()');
    expect(wizard).toContain('Reissue New Agreement');
    expect(wizard).toContain('Last opened:');
    expect(wizard).toContain('Waiting on ${outstandingAgreementSigners.join');
  });

  it('renders the supplied letterhead, Robert signature and one signing row per tenant', () => {
    expect(pdf).toContain("'letterhead-header.png'");
    expect(pdf).toContain("'letterhead-footer.png'");
    expect(pdf).toContain("'robert-fleming-signature.png'");
    expect(pdf).toContain('input.tenants.forEach((tenant, index)');
    expect(fs.existsSync(path.resolve(__dirname, 'agreement-assets/robert-fleming-signature.png'))).toBe(true);
  });

  it('merges property compliance after the APT and stores the completed PDF everywhere required', () => {
    expect(backend).toContain('appendComplianceDocuments(agreementPdf, compliance.attachments)');
    expect(backend).toContain("entities.push(['property', agreement.property_id])");
    expect(backend).toContain("entities.push(['tenant', agreement.tenant_id])");
    expect(backend).toContain("entities.push(['tenant', agreement.joint_tenant_id])");
    expect(backend).toContain("doc_type = 'Signed Tenancy Agreement'");
  });

  it('shows signed-link state, named outstanding signers, prefilled identity and responsive signing controls', () => {
    expect(signingForm).toContain('Your agreement has already been signed');
    expect(signingForm).toContain('outstanding_signers');
    expect(signingForm).toContain("value=d.signer_name||''");
    expect(signingForm).toContain("value=d.today||new Date().toISOString().slice(0,10)");
    expect(signingForm).toContain('@media(max-width:820px)');
    expect(signingForm).toContain('Privacy Policy');
    expect(signingForm).toContain('#toolbar=0&navpanes=0');
  });

  it('keeps both applicants linked and advances the shared onboarding workflow', () => {
    expect(backend).toContain('UPDATE tenants SET linked_tenant_id = $1');
    expect(backend).toContain('onboarding_step = GREATEST');
    expect(backend).toContain('WHERE id = ANY($1::int[])');
    expect(tenants).toContain('UsersRound');
    expect(tenantDetail).toContain('Joint tenant:');
  });

  it('keeps applicant identity fields on their own records and exposes their communications', () => {
    expect(tenantDetail).toContain('hasInlineJointApplicant');
    expect(tenantDetail).toContain('!tenant?.linked_tenant_id');
    expect(tenantDetail).toContain('CommunicationsHistory');
    expect(backend).toContain("app.get('/api/tenants/:id/communications'");
    expect(backend).toContain('LOWER(to_email) = LOWER($3)');
  });

  it('preserves three-address history and promotes the occupied property to current address', () => {
    expect(database).toContain('address_before_previous TEXT');
    expect(database).toContain('previous_address = t.current_address');
    expect(backend).toContain('const tenantCurrentAddress = normalizePropertyAddress');
    expect(backend).toContain('current_address = $3, previous_address = $4, address_before_previous = $5');
    expect(tenantDetail).toContain('Address Before Previous');
  });

  it('uses CRM-native confirmations instead of browser confirm dialogs', () => {
    const frontendRoot = path.resolve(__dirname, '../../frontend/src');
    const files: string[] = [];
    const visit = (directory: string) => fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (/\.tsx?$/.test(entry.name)) files.push(target);
    });
    visit(frontendRoot);
    const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/(?:window\.)?confirm\s*\(/);
    expect(source).toContain('confirmAction: (message: string');
    expect(source).toContain('window.alert =');
  });

  it('sends exact agreement and final-balance SMS copy with a mandatory follow-up task', () => {
    expect(wizard).toContain('Hi there {{first_name}}, your tenancy agreement is ready to view and for your digital signature.');
    expect(wizard).toContain('Hi {{first_name}}, thank you for signing your tenancy agreement and completing our application and screening process.');
    expect(wizard).toContain('Follow-up date *');
    expect(backend).toContain('Chase final tenancy balance for');
    expect(backend).toContain('balance_follow_up_date = $2');
  });

  it('previews the real branded agreement and final-balance emails', () => {
    expect(wizard).toContain('Preview branded email');
    expect(wizard).toContain('previewOnly');
    expect(backend).toContain("tenancy-agreement/email-preview");
    expect(backend).toContain("request-balance/email-preview");
    expect(email).toContain("renderFinalEmailTemplate('06-tenancy-agreement.html'");
    expect(email).toContain("renderFinalEmailTemplate('08-final-balance-handover.html'");
  });

  it('provides a unique, prefilled maintenance form on the report domain with uploads and emergency details', () => {
    expect(backend).toContain('https://report.fleminglettings.co.uk/${reportToken}');
    expect(backend).toContain("maintenanceUpload.array('files', 6)");
    expect(backend).toContain('please use the following link to report any maintenance requests, damage, lost keys, or any other property issues');
    expect(maintenanceForm).toContain('<option value="other">Other</option>');
    expect(maintenanceForm).toContain('Photos or videos');
    expect(maintenanceForm).toContain('within 48 hours');
    expect(maintenanceForm).toContain('01902 212 415');
    expect(vercel.rewrites[0].has[0].value).toBe('report.fleminglettings.co.uk');
  });
});
