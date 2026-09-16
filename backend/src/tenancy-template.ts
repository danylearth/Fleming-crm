import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import type { TenancyAgreementPdfInput } from './tenancy-agreement-pdf';

const exec = promisify(execFile);
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
const xmlText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');

/** Preserve the supplied contract's clauses, tables, headers and page settings. */
export async function generateSourceTenancyPdf(input: TenancyAgreementPdfInput): Promise<Buffer> {
  if (pending >= 1) throw new Error('Other agreements are being prepared. Please try again shortly.');
  pending++;
  const work = queue.then(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fleming-agreement-'));
    try {
      const template = await fs.readFile(path.join(__dirname, 'agreement-assets/assured-periodic-tenancy-template.docx'));
      const zip = new PizZip(template);
      const date = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
      const names = input.tenants.map(t => t.name).join(' and ');
      const values: Record<string, string> = {
        AGREEMENT_DATE: date(input.agreementDate), START_DATE: date(input.tenancyStartDate),
        RENT_DAY: input.tenancyStartDate.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Europe/London' }),
        TENANT_NAMES: names, PROPERTY_ADDRESS: input.propertyAddress,
        RENT: input.rent.toLocaleString('en-GB',{minimumFractionDigits:2}), DEPOSIT: input.deposit.toLocaleString('en-GB',{minimumFractionDigits:2}), PAYMENT_REFERENCE: input.paymentReference,
        OCCUPIERS: input.permittedOccupiers || 'None', SHARED_FACILITIES: input.sharedFacilities || 'None', PARKING: input.parking || 'None',
        TENANT_EMAILS: input.tenants.map(t => t.email).filter(Boolean).join('; '),
        TENANT_PHONES: input.tenants.map(t => t.phone).filter(Boolean).join('; '),
        TENANT_ADDRESSES: input.tenants.map(t => `${t.name}: ${t.address || 'Not supplied'}`).join('\n'),
        TENANT_SIGNING_SECTIONS: input.tenants.map((t, i) => `Tenant ${i + 1}: ${t.name}\nSignature and date:\n\n`).join('\n'),
        DEPOSIT_CONTRIBUTOR: input.depositContributorDetails ? `Deposit contribution disclosed by the tenant(s): ${input.depositContributorDetails}` : '',
        GAS_ACKNOWLEDGEMENT: input.hasGas ? 'Gas Safety Certificate' : 'Gas Safety Certificate: not applicable (no gas connection)',
      };
      let xml = zip.file('word/document.xml')!.asText();
      if(!input.hasGas)xml=xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g,row=>row.includes('{{GAS_ACKNOWLEDGEMENT}}')?'':row);
      xml=xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g,paragraph=>paragraph.replace(/<[^>]+>/g,'').includes('The electronic signature certificate records each named tenant')?'':paragraph);
      xml = xml.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) => {
        if (!(key in values)) throw new Error(`Unfilled agreement field: ${key}`);
        return xmlText(values[key]);
      });
      if (/#####|\{\{[A-Z_]+\}\}/.test(xml)) throw new Error('Agreement template contains an unfilled field');
      // Keep the supplied wording and layout while applying the requested body font.
      xml=xml.replace(/<w:rFonts[^>]*\/>/g, '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
      xml=xml.replace(/(<w:t[^>]*>)Signed:(<\/w:t>)/g, '$1Signed: signatures and dates for each party are recorded in the electronic signature certificate, applying to this addendum.$2');
      zip.file('word/document.xml', xml);
      const styles=zip.file('word/styles.xml');
      if(styles)zip.file('word/styles.xml',styles.asText().replace(/<w:rFonts[^>]*\/>/g,'<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'));
      const docx = path.join(dir, 'agreement.docx');
      await fs.writeFile(docx, zip.generate({ type: 'nodebuffer' }));
      await exec(process.env.LIBREOFFICE_PATH || 'soffice', [
        `-env:UserInstallation=${pathToFileURL(path.join(dir, 'profile')).href}`,
        '--headless', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', dir, docx,
      ], { timeout: 60000, maxBuffer: 1024 * 1024 });
      const pdf = await fs.readFile(path.join(dir, 'agreement.pdf'));
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('The agreement could not be rendered as a PDF');
      const document = await PDFDocument.load(pdf);
      document.setTitle(`Assured Periodic Tenancy - ${input.propertyAddress}`);
      return Buffer.from(await document.save());
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
  queue = work.catch(() => undefined);
  try { return await work; } finally { pending--; }
}
