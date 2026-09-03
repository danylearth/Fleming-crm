import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildCompletedApplicationSections, generateCompletedApplicationPdf } from './application-pdf';

describe('completed tenancy application PDF', () => {
  it('groups answered fields and omits blank answers', () => {
    const sections = buildCompletedApplicationSections({
      first_name: 'Test', gross_annual_income: '32000', next_of_kin_name: 'Taylor',
      next_of_kin_email: '', supporting_information: '', has_pets: false,
      declaration_privacy: true,
    });
    expect(sections.map(section => section.title)).toEqual([
      'Personal details', 'Employment and income', 'References and next of kin', 'Tenancy information',
    ]);
    const keys = sections.flatMap(section => section.answers.map(answer => answer.key));
    expect(keys).not.toContain('next_of_kin_email');
    expect(keys).not.toContain('supporting_information');
    expect(keys).not.toContain('declaration_privacy');
    expect(keys).toContain('has_pets');
  });

  it('creates a valid multi-section PDF with the signed application', async () => {
    const signature = await sharp({
      create: { width: 120, height: 40, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();
    const result = await generateCompletedApplicationPdf({
      enquiryId: 71,
      applicantName: 'Test Applicant',
      propertyAddress: '1 Test Street, WV1 1AA',
      submittedAt: new Date('2026-08-31T12:00:00Z'),
      formData: {
        first_name: 'Test',
        last_name: 'Applicant',
        gross_annual_income: '32000',
        declaration_holding_deposit: true,
        declaration_info_accurate: true,
        declaration_privacy: true,
        declaration_enquiries: true,
        declaration_documents: true,
        declaration_credit_check: true,
        declaration_terms: true,
      },
      signatureName: 'Test Applicant',
      signatureDataUrl: `data:image/png;base64,${signature.toString('base64')}`,
      auditEntries: [
        { timestamp: new Date('2026-08-31T11:55:00Z'), action: 'Opened application form', detail: 'Secure application link opened' },
        { timestamp: new Date('2026-08-31T12:00:00Z'), action: 'Submitted application', detail: 'Initial application submitted' },
      ],
    });

    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.length).toBeGreaterThan(3_000);
    expect(result.toString('latin1')).toContain('/Title');
  });
});
