import PDFDocument from 'pdfkit';

export interface CompletedApplicationPdfInput {
  enquiryId: number;
  applicantName: string;
  propertyAddress: string;
  submittedAt: Date;
  formData: Record<string, unknown>;
  signatureName: string;
  signatureDataUrl: string;
}

const HOLDING_DEPOSIT_TERMS = [
  'By paying an initial holding deposit, the applicant asks for the property to be reserved while pre-tenancy checks are completed. The amount must not exceed one week\'s rent (1/52 of the annual rent).',
  'The payment is not a tenancy deposit and does not create a tenancy. It temporarily reserves the property while referencing and administration take place, and it is not protected under a Tenancy Deposit Protection Scheme.',
  'The holding deposit may be retained if an applicant provides false or misleading information that affects the landlord\'s decision, fails a Right to Rent check, withdraws, or fails to take reasonable steps to enter the tenancy by the agreed deadline.',
  'A full refund will be issued if the landlord or agent withdraws the property, the landlord does not proceed for reasons unrelated to the applicant, all parties take reasonable steps but do not sign by the deadline, or accurate information is provided and the landlord declines to proceed.',
  'The normal deadline for all parties to sign is 15 days after the holding deposit is received unless a different deadline is agreed in writing. Either party may cancel in writing, one proposed tenant cancelling is treated as cancellation for all proposed tenants, and this agreement does not oblige either party to proceed with a tenancy.',
];

const DECLARATION_LABELS: Record<string, string> = {
  declaration_holding_deposit: 'I have read and agree to the Holding Deposit Terms and understand when the holding deposit may be retained.',
  declaration_info_accurate: 'I confirm the information supplied is true and complete and understand that false or misleading information may lead to refusal.',
  declaration_privacy: 'I understand my information will be retained and processed for this application under the Privacy Policy and UK GDPR.',
  declaration_enquiries: 'I authorise Fleming Lettings to contact relevant organisations and referees to verify the information provided.',
  declaration_documents: 'I consent to receive tenancy documents by email.',
  declaration_credit_check: 'I consent to Fleming Lettings & Developments UK Limited carrying out a credit check and referencing process.',
  declaration_terms: 'I have read and accept the Terms and Conditions.',
  marketing_consent: 'I consent to marketing communications.',
};

const labelFor = (key: string) => key
  .replace(/^declaration_/, '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, character => character.toUpperCase());

const valueFor = (value: unknown): string => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.map(valueFor).join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

export interface ApplicationPdfSection {
  title: string;
  answers: Array<{ key: string; label: string; value: string }>;
}

const SECTION_ORDER = [
  'Personal details', 'Address history', 'Employment and income', 'Financial information',
  'References and next of kin', 'Tenancy information', 'Additional information',
];

const sectionFor = (key: string): string => {
  if (/^(first_name|last_name|email|phone|date_of_birth|ni_number|marital_status|residency_status|has_joint_applicants|joint_applicants)$/.test(key)) return 'Personal details';
  if (/address|years_at_|current_landlord|current_monthly_rent|landlord_contact_authority/.test(key) && !/reference|guarantor|next_of_kin|property_address/.test(key)) return 'Address history';
  if (/employment|employer|self_employed|contractor|student|business|company_number|income|accountant|job_title|years_trading/.test(key)) return 'Employment and income';
  if (/bank_|loan|credit_card|legal_proceedings|additional_income/.test(key)) return 'Financial information';
  if (/reference|next_of_kin/.test(key)) return 'References and next of kin';
  if (/property_|preferred_|rental_|tenancy_|deposit|occupant|pet|guarantor|forwarding_address/.test(key)) return 'Tenancy information';
  return 'Additional information';
};

const hasAnswer = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
};

export function buildCompletedApplicationSections(formData: Record<string, unknown>): ApplicationPdfSection[] {
  const grouped = new Map<string, ApplicationPdfSection['answers']>();
  for (const [key, value] of Object.entries(formData)) {
    if (key in DECLARATION_LABELS || !hasAnswer(value)) continue;
    const title = sectionFor(key);
    const answers = grouped.get(title) || [];
    answers.push({ key, label: labelFor(key), value: valueFor(value) });
    grouped.set(title, answers);
  }
  return SECTION_ORDER.flatMap(title => grouped.has(title) ? [{ title, answers: grouped.get(title)! }] : []);
}

export function generateCompletedApplicationPdf(input: CompletedApplicationPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
      info: {
        Title: `Completed Tenancy Application - ${input.applicantName}`,
        Author: 'Fleming Lettings',
        Subject: `Tenant enquiry ${input.enquiryId}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentWidth = doc.page.width - 100;
    const ensureSpace = (height: number) => {
      if (doc.y + height > doc.page.height - 78) doc.addPage();
    };
    const section = (title: string) => {
      ensureSpace(42);
      doc.moveDown(0.7)
        .font('Helvetica-Bold').fontSize(13).fillColor('#c7592b').text(title)
        .moveDown(0.35);
      doc.moveTo(50, doc.y).lineTo(50 + contentWidth, doc.y).strokeColor('#e8d8ce').stroke();
      doc.moveDown(0.55);
    };

    doc.rect(0, 0, doc.page.width, 104).fill('#20201f');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('FLEMING LETTINGS', 50, 34);
    doc.font('Helvetica').fontSize(10).fillColor('#e7c7b7').text('Completed Tenancy Application', 50, 68);
    doc.y = 126;

    doc.fillColor('#20201f').font('Helvetica-Bold').fontSize(18).text(input.applicantName || 'Applicant');
    doc.font('Helvetica').fontSize(10).fillColor('#555555');
    doc.text(`Property: ${input.propertyAddress || 'Not specified'}`);
    doc.text(`Submitted: ${input.submittedAt.toLocaleString('en-GB', { timeZone: 'Europe/London' })}`);
    doc.text(`CRM enquiry: ${input.enquiryId}`);

    for (const applicationSection of buildCompletedApplicationSections(input.formData)) {
      section(applicationSection.title);
      for (const answer of applicationSection.answers) {
        ensureSpace(40);
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#555555').text(answer.label);
        doc.font('Helvetica').fontSize(10).fillColor('#20201f').text(answer.value, { width: contentWidth });
        doc.moveDown(0.45);
      }
    }

    section('Holding Deposit Terms');
    for (const paragraph of HOLDING_DEPOSIT_TERMS) {
      ensureSpace(58);
      doc.font('Helvetica').fontSize(9).fillColor('#20201f').text(paragraph, { width: contentWidth, lineGap: 2 });
      doc.moveDown(0.55);
    }

    section('Applicant declarations');
    for (const [key, declaration] of Object.entries(DECLARATION_LABELS)) {
      ensureSpace(38);
      const accepted = input.formData[key] === true;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(accepted ? '#23744b' : '#a33b32')
        .text(accepted ? 'ACCEPTED' : 'NOT ACCEPTED', { continued: true });
      doc.font('Helvetica').fillColor('#20201f').text(`  ${declaration}`, { width: contentWidth });
      doc.moveDown(0.4);
    }

    ensureSpace(180);
    section('Electronic signature');
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`Signed by: ${input.signatureName}`);
    doc.text(`Date: ${input.submittedAt.toLocaleDateString('en-GB', { timeZone: 'Europe/London' })}`);
    doc.moveDown(0.5);
    try {
      doc.image(input.signatureDataUrl, { fit: [240, 90] });
    } catch {
      doc.font('Helvetica-Oblique').fillColor('#a33b32').text('Signature image could not be rendered.');
    }

    const range = doc.bufferedPageRange();
    for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor('#777777')
        .text(`Fleming Lettings - Page ${pageIndex + 1} of ${range.count}`, 50, doc.page.height - 58, {
          width: contentWidth,
          align: 'center',
          lineBreak: false,
        });
    }

    doc.end();
  });
}
