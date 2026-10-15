import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  bankDetailsForRoute,
  FLEMING_CLIENT_MONEY_ACCOUNT,
  FLEMING_OPERATING_ACCOUNT,
  generateTenancyAgreementPdf,
  resolveAgreementType,
  resolvePaymentRoute,
  type TenancyAgreementPdfInput,
} from './tenancy-agreement-pdf';
import {finaliseSigningBlock,formatSignatureSpacing,placeCompanySignatureBelowLandlordLabels} from './tenancy-template';

const baseInput: TenancyAgreementPdfInput = {
  enquiryId: 42,
  agreementType: 'internal',
  agreementDate: new Date('2026-09-01T12:00:00Z'),
  tenancyStartDate: new Date('2026-09-15T12:00:00Z'),
  rent: 950,
  deposit: 950,
  propertyAddress: '10 Test Street, Wolverhampton, WV1 1AA',
  hasGas: true,
  landlord: { name: 'Fleming Lettings & Developments UK Limited' },
  tenants: [{ name: 'Ms Test Tenant', email: 'tenant@example.com', phone: '07123456789', address: '1 Old Road, WV2 2BB' }],
  permittedOccupiers: 'None',
  sharedFacilities: 'Communal entrance',
  parking: 'One allocated space',
  paymentReference: '10 WV11AA - TENANT',
  bankDetails: FLEMING_OPERATING_ACCOUNT,
  paymentRoute: 'fleming_operating',
  complianceDocuments: ['EPC', 'EICR', 'Gas Safety certificate'],
};

describe('tenancy agreement routing', () => {
  it('uses the portfolio owner and service type to select the agreement and bank route', () => {
    expect(resolveAgreementType('internal')).toBe('internal');
    expect(resolveAgreementType('external')).toBe('client');
    expect(resolvePaymentRoute('internal', 'let_only')).toBe('fleming_operating');
    expect(resolvePaymentRoute('client', 'let_only')).toBe('landlord');
    expect(resolvePaymentRoute('client', 'rent_collection')).toBe('fleming_client_money');
    expect(resolvePaymentRoute('client', 'full_management')).toBe('fleming_client_money');
    expect(FLEMING_OPERATING_ACCOUNT.accountNumber).toBe('53346137');
    expect(FLEMING_CLIENT_MONEY_ACCOUNT.accountNumber).toBe('03803880');
  });

  it('normalises and validates landlord bank details', () => {
    expect(bankDetailsForRoute('fleming_client_money')).toEqual(FLEMING_CLIENT_MONEY_ACCOUNT);
    expect(bankDetailsForRoute('landlord', {
      sortCode: '123456', accountNumber: '12345678', accountName: 'A Landlord', bankName: 'Example Bank',
    }).sortCode).toBe('12-34-56');
    expect(() => bankDetailsForRoute('landlord', {
      sortCode: '1234', accountNumber: '123', accountName: '', bankName: '',
    })).toThrow('sort code');
  });
});

describe('tenancy agreement PDFs', () => {
  it('puts the company signature below each landlord label in Fleming-owned APTs', () => {
    const labels='<w:p><w:r><w:t>Landlords Signature:</w:t></w:r></w:p><w:p><w:r><w:t>Tenants Signature:</w:t></w:r></w:p><w:p><w:r><w:t>Landlords Signature:</w:t></w:r></w:p>';
    const output=placeCompanySignatureBelowLandlordLabels(labels,'<w:drawing><wp:inline><wp:docPr id="1" name="Picture 1"/><pic:cNvPr id="1" name="Picture 1"/></wp:inline></w:drawing>');
    expect(formatSignatureSpacing('<w:p><w:r><w:t>Signed as an agreement</w:t></w:r></w:p><w:p><w:r><w:t>Signature:</w:t><w:drawing/></w:r></w:p>',true)).not.toContain('<w:drawing');
    expect(output.match(/<w:drawing>/g)).toHaveLength(2);
    expect(output).toMatch(/Landlords Signature:<\/w:t>[\s\S]*?<w:drawing>/);
    expect(output).toContain('Fleming company signature 900');
    expect(output).toContain('Fleming company signature 901');
    expect(output).toMatch(/<pic:cNvPr\s+id="900"\s+name="Fleming company signature 900"\/>/);
  });

  it('shows the agreement date while omitting electronic-signing notices from the contract body',()=>{
    const xml='<w:p><w:r><w:t>Dated Signed:</w:t></w:r></w:p><w:p><w:r><w:t>Recorded electronically in the signing certificate</w:t></w:r></w:p>';
    const result=finaliseSigningBlock(xml,'6th November 2026');
    expect(result).toContain('Dated Signed: 6th November 2026');
    expect(result).not.toContain('Recorded electronically');
  });

  it.each([
    ['Fleming-owned', baseInput],
    ['client-owned without gas', {
      ...baseInput,
      agreementType: 'client' as const,
      serviceType: 'let_only',
      hasGas: false,
      landlord: { name: 'Test Client Landlord', email: 'landlord@example.com', phone: '01902123456', address: '20 Owner Road, WV3 3CC' },
      bankDetails: { sortCode: '12-34-56', accountNumber: '12345678', accountName: 'Test Client Landlord', bankName: 'Example Bank' },
      paymentRoute: 'landlord' as const,
      complianceDocuments: ['EPC', 'EICR'],
    }],
  ])('creates a readable multi-page %s agreement', async (_label, input) => {
    const buffer = await generateTenancyAgreementPdf(input);
    const pdf = await PDFDocument.load(buffer);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(10);
    expect(pdf.getTitle()).toContain('Assured Periodic Tenancy');
  }, 60000);
});
