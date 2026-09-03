import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export const OUTBOUND_EMAIL_ADDRESS = 'contact@tenancies.fleminglettings.co.uk';
export const EMAIL_FROM = `Fleming Lettings <${OUTBOUND_EMAIL_ADDRESS}>`;
const ALLOW_SIMULATED_MESSAGES = process.env.ALLOW_SIMULATED_MESSAGES === 'true' && process.env.NODE_ENV !== 'production';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const emailTemplateDirectory = path.join(__dirname, 'email-templates');

function renderFinalEmailTemplate(filename: string, values: Record<string, string>): string {
  let html = fs.readFileSync(path.join(emailTemplateDirectory, filename), 'utf8');
  for (const [key, value] of Object.entries(values)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  const unresolved = html.match(/\{\{[A-Z_]+\}\}/g);
  if (unresolved) throw new Error(`Missing values for ${filename}: ${[...new Set(unresolved)].join(', ')}`);
  // The supplied final HTML references a local assets folder that was not part
  // of the hand-off. Avoid sending broken image URLs; retain a text logo so the
  // Fleming brand remains visible when images are unavailable.
  html = html.replace(/<img\s+src="assets\/[^"]+"[^>]*alt="([^"]*)"[^>]*\/>/g, (_tag, alt: string) =>
    alt === 'Fleming Lettings'
      ? '<span style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:.5px">FLEMING LETTINGS</span>'
      : ''
  );
  return html;
}

function addressParts(address: string): { full: string; short: string; remainder: string } {
  const full = normalizePropertyAddress(address);
  const [short, ...remainder] = full.split(',').map(part => part.trim()).filter(Boolean);
  return { full, short: short || full, remainder: remainder.join(', ') };
}

function emailMoneyCompact(value: number): string {
  return Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}

function emailDisclaimer(): string {
  return `
    <div style="padding:20px 40px">
      <p style="font-size:10px;color:#9A93A0;line-height:1.5;margin:0">
        This email and any attachments are confidential and intended only for the named recipient. If you received it in error, please delete it and notify us. Fleming Lettings and Developments UK Limited, company number 13943597. Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG.
      </p>
    </div>`;
}

export function brandedEmailHtml(title: string, content: string): string {
  return `<!doctype html><html><body style="margin:0;background:#EEEEEE;font-family:Helvetica,Arial,sans-serif;color:#1E1E1E">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EEEEEE"><tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff">
        <tr><td style="padding:30px 40px;background:#27083D">
          <table role="presentation" width="100%"><tr><td style="font-size:21px;font-weight:bold;color:#ffffff">FLEMING LETTINGS</td><td align="right" style="font-size:19px;font-weight:bold;color:#DC006D">${escapeHtml(title)}</td></tr></table>
        </td></tr>
        <tr><td style="height:6px;background:#DC006D;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:34px 40px;font-size:16px;line-height:1.65">${content}</td></tr>
        <tr><td style="background:#DC006D;padding:24px 40px;color:#ffffff"><strong style="font-size:24px">All of your property needs</strong><br><strong style="font-size:24px;color:#27083D">Without any of the hassle</strong></td></tr>
        <tr><td style="background:#27083D;padding:24px 40px;color:#ffffff;font-size:13px;line-height:1.65"><strong>Lettings Support Team | fleminglettings.co.uk</strong><br><a href="mailto:${OUTBOUND_EMAIL_ADDRESS}" style="color:#ffffff">${OUTBOUND_EMAIL_ADDRESS}</a><br>01902 212 415</td></tr>
        <tr><td style="background:#1E1E1E">${emailDisclaimer()}</td></tr>
      </table>
    </td></tr></table></body></html>`;
}

function emailMoney(value: number): string {
  return Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function emailDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

function emailSummaryRow(label: string, value: string, highlighted = false): string {
  const background = highlighted ? '#563F6E' : '#EEEEEE';
  const colour = highlighted ? '#ffffff' : '#27083D';
  const fontSize = highlighted ? '20px' : '15px';
  return `<tr><td style="padding:14px 18px;background:${background};color:${highlighted ? '#ffffff' : '#1E1E1E'};font-size:15px;font-weight:${highlighted ? 'bold' : 'normal'}">${escapeHtml(label)}</td><td align="right" style="padding:14px 18px;background:${background};color:${colour};font-size:${fontSize};font-weight:bold">${value}</td></tr>`;
}

export interface TenancyAgreementEmailInput {
  firstName: string;
  propertyAddress: string;
  tenancyStartDate: string | Date;
  landlordName: string;
  landlordAddress?: string | null;
  monthlyRent: number;
  securityDeposit: number;
  fundsOnAccount: number;
  balanceDue: number;
  signingUrl: string;
  customMessage?: string | null;
}

export function tenancyAgreementEmail(input: TenancyAgreementEmailInput): { subject: string; html: string } {
  const address = addressParts(input.propertyAddress);
  return {
    subject: 'Your tenancy agreement is ready to sign',
    html: renderFinalEmailTemplate('06-tenancy-agreement.html', {
      FIRST_NAME: escapeHtml(input.firstName || 'there'),
      PROPERTY_ADDRESS: escapeHtml(address.full),
      PROPERTY_SHORT_ADDRESS: escapeHtml(address.short),
      PROPERTY_ADDRESS_REMAINDER: escapeHtml(address.remainder),
      INTRO_MESSAGE: escapeHtml(input.customMessage || `Your tenancy agreement for ${address.full} is ready to review and sign.`).replace(/\r?\n/g, '<br>'),
      TENANCY_START_DATE: emailDate(input.tenancyStartDate),
      LANDLORD_NAME: escapeHtml(input.landlordName),
      LANDLORD_ADDRESS: escapeHtml(input.landlordAddress || ''),
      MONTHLY_RENT: emailMoneyCompact(input.monthlyRent),
      SECURITY_DEPOSIT: emailMoneyCompact(input.securityDeposit),
      FUNDS_ON_ACCOUNT: emailMoneyCompact(input.fundsOnAccount),
      BALANCE_DUE: emailMoneyCompact(input.balanceDue),
      SIGNING_URL: escapeHtml(input.signingUrl),
    }),
  };
}

export function completedTenancyAgreementEmail(firstName: string, propertyAddress: string): { subject: string; html: string } {
  const address = addressParts(propertyAddress);
  return {
    subject: 'Copy of your completed tenancy agreement',
    html: renderFinalEmailTemplate('07-completed-tenancy-agreement.html', {
      FIRST_NAME: escapeHtml(firstName || 'there'),
      PROPERTY_SHORT_ADDRESS: escapeHtml(address.short),
    }),
  };
}

export interface FinalBalanceEmailInput {
  firstName: string;
  propertyAddress: string;
  securityDeposit: number;
  monthlyRent: number;
  holdingDeposit: number;
  balanceDue: number;
  bankDetails: { bankName: string; accountName: string; sortCode: string; accountNumber: string };
  paymentReference: string;
  customMessage?: string | null;
}

export function finalBalanceHandoverEmail(input: FinalBalanceEmailInput): { subject: string; html: string } {
  const address = addressParts(input.propertyAddress);
  return {
    subject: 'Final balance and handover',
    html: renderFinalEmailTemplate('08-final-balance-handover.html', {
      FIRST_NAME: escapeHtml(input.firstName || 'there'),
      PROPERTY_ADDRESS: escapeHtml(address.full),
      PROPERTY_SHORT_ADDRESS: escapeHtml(address.short),
      INTRO_MESSAGE: escapeHtml(input.customMessage || `Your tenancy agreement has been completed. The remaining balance for ${address.full} is set out below.`).replace(/\r?\n/g, '<br>'),
      SECURITY_DEPOSIT: emailMoney(input.securityDeposit),
      MONTHLY_RENT: emailMoney(input.monthlyRent),
      HOLDING_DEPOSIT: emailMoney(input.holdingDeposit),
      BALANCE_DUE: emailMoney(input.balanceDue),
      BANK_NAME: escapeHtml(input.bankDetails.bankName),
      ACCOUNT_NAME: escapeHtml(input.bankDetails.accountName),
      SORT_CODE: escapeHtml(input.bankDetails.sortCode),
      ACCOUNT_NUMBER: escapeHtml(input.bankDetails.accountNumber),
      PAYMENT_REFERENCE: escapeHtml(input.paymentReference),
    }),
  };
}

export interface HandoverAppointmentEmailInput {
  firstName: string;
  propertyAddress: string;
  appointmentDate: string | Date;
  appointmentTime: string;
  appointmentWith: string;
  customMessage?: string | null;
}

export function handoverAppointmentEmail(input: HandoverAppointmentEmailInput): { subject: string; html: string } {
  const address = addressParts(input.propertyAddress);
  const mapQuery = encodeURIComponent(address.full);
  const date = input.appointmentDate instanceof Date
    ? input.appointmentDate
    : new Date(`${String(input.appointmentDate).slice(0, 10)}T12:00:00Z`);
  const displayDate = Number.isNaN(date.getTime())
    ? escapeHtml(input.appointmentDate)
    : date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const intro = escapeHtml(input.customMessage || 'Finally, we’re nearly there! Your move in and handover appointment is confirmed. We will meet you at the property to conduct the inventory, hand over the keys and answer any final questions that you may have.').replace(/\r?\n/g, '<br>');
  return {
    subject: 'Your move in and handover date',
    html: renderFinalEmailTemplate('09-move-in-date.html', {
      FIRST_NAME: escapeHtml(input.firstName || 'there'),
      PROPERTY_ADDRESS: escapeHtml(address.full),
      PROPERTY_SHORT_ADDRESS: escapeHtml(address.short),
      APPOINTMENT_DATE: displayDate,
      APPOINTMENT_TIME: escapeHtml(input.appointmentTime),
      APPOINTMENT_WITH: escapeHtml(input.appointmentWith),
      INTRO_MESSAGE: intro,
      GOOGLE_MAP_URL: escapeHtml(`https://www.google.com/maps/search/?api=1&query=${mapQuery}`),
      APPLE_MAP_URL: escapeHtml(`https://maps.apple.com/?q=${mapQuery}`),
    }),
  };
}

export function normalizePropertyAddress(address: string, postcode?: string | null): string {
  const cleanAddress = String(address || '').trim().replace(/,\s*$/, '');
  const cleanPostcode = String(postcode || '').trim();
  if (!cleanPostcode) return cleanAddress;
  const compactAddress = cleanAddress.replace(/\s/g, '').toLowerCase();
  const compactPostcode = cleanPostcode.replace(/\s/g, '').toLowerCase();
  return compactAddress.endsWith(compactPostcode) ? cleanAddress : `${cleanAddress}, ${cleanPostcode}`;
}

export function applicationChangesRequestedEmail(name: string, changes: string, applicationUrl: string): { subject: string; html: string } {
  return {
    subject: 'More information required for your tenancy application',
    html: renderFinalEmailTemplate('05-application-review.html', {
      FIRST_NAME: escapeHtml(name || 'there'),
      REQUESTED_CHANGES: escapeHtml(changes).replace(/\r?\n/g, '<br>'),
      APPLICATION_URL: escapeHtml(applicationUrl),
    }),
  };
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; id?: string; error?: string; simulated?: boolean }> {
  if (!resend) {
    if (ALLOW_SIMULATED_MESSAGES) {
      console.log('[EMAIL SIMULATED]', { to: params.to, subject: params.subject });
      return { success: true, id: 'simulated-' + Date.now(), simulated: true };
    }
    const error = 'Email service is not configured (RESEND_API_KEY is missing)';
    console.error('[EMAIL ERROR]', error);
    return { success: false, error };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: OUTBOUND_EMAIL_ADDRESS,
      attachments: params.attachments,
    });

    if (error) {
      console.error('[EMAIL ERROR]', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[EMAIL ERROR]', err);
    return { success: false, error: err.message || 'Failed to send email' };
  }
}

// ── Email Templates ──

export function viewingConfirmationEmail(name: string, address: string, date: string): { subject: string; html: string } {
  const cleanAddress = addressParts(address);
  const mapQuery = encodeURIComponent(cleanAddress.full);
  return {
    subject: `Your viewing with Fleming Lettings at ${cleanAddress.full}`,
    html: renderFinalEmailTemplate('02-viewing-confirmation.html', {
      FIRST_NAME: escapeHtml(name || 'there'),
      PROPERTY_ADDRESS: escapeHtml(cleanAddress.full),
      PROPERTY_SHORT_ADDRESS: escapeHtml(cleanAddress.short),
      VIEWING_DATE: escapeHtml(date),
      GOOGLE_MAP_URL: escapeHtml(`https://www.google.com/maps/search/?api=1&query=${mapQuery}`),
      APPLE_MAP_URL: escapeHtml(`https://maps.apple.com/?q=${mapQuery}`),
    }),
  };
}

export function referenceChaseEmail(landlordName: string, tenantName: string, propertyAddress: string): { subject: string; html: string } {
  return {
    subject: `Reference Request - ${tenantName}`,
    html: brandedEmailHtml('Landlord Reference Request', `
        <p>Dear ${landlordName},</p>
        <p>We are writing regarding a reference request for <strong>${tenantName}</strong>, who has applied for a property at <strong>${propertyAddress}</strong>.</p>
        <p>We would greatly appreciate it if you could provide a landlord reference at your earliest convenience. We kindly request a response within <strong>48 hours</strong>.</p>
        <p>If you have any questions, please don't hesitate to get in touch.</p>
    `),
  };
}

export function rentReminderEmail(tenantName: string, amount: number, address: string, dueDate: string): { subject: string; html: string } {
  return {
    subject: `Rent Payment Reminder - ${address}`,
    html: brandedEmailHtml('Rent Payment Reminder', `
        <p>Dear ${tenantName},</p>
        <p>This is a friendly reminder that your rent payment is outstanding:</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>Property:</strong> ${address}<br/>
          <strong>Amount Due:</strong> &pound;${amount.toLocaleString()}<br/>
          <strong>Due Date:</strong> ${dueDate}
        </div>
        <p>If you have already made this payment, please disregard this message. Otherwise, please arrange payment as soon as possible.</p>
        <p>If you are experiencing difficulties, please contact us to discuss your options.</p>
    `),
  };
}

export function statusUpdateEmail(name: string, address: string, status: string): { subject: string; html: string } {
  const statusMessages: Record<string, string> = {
    viewing_booked: 'a viewing has been booked',
    awaiting_response: 'we are awaiting a response on your application',
    onboarding: 'your application has been approved and we are beginning the onboarding process',
    rejected: 'unfortunately your application has not been successful at this time',
    converted: 'congratulations — your tenancy has been confirmed',
  };

  return {
    subject: `Application Update - ${address}`,
    html: brandedEmailHtml('Application Update', `
        <p>Hi ${name},</p>
        <p>We wanted to let you know that regarding your application for <strong>${address}</strong>, ${statusMessages[status] || 'your application status has been updated'}.</p>
        <p>If you have any questions, please don't hesitate to get in touch.</p>
      `),
  };
}

export function holdingDepositRequestEmail(
  name: string, address: string, monthlyRent: number, securityDeposit: number,
  holdingDeposit: number, applicationFormUrl: string
): { subject: string; html: string } {
  const propertyAddress = addressParts(address);
  return {
    subject: `Holding Deposit Request - ${address}`,
    html: renderFinalEmailTemplate('03-holding-deposit.html', {
      FIRST_NAME: escapeHtml(name || 'there'),
      PROPERTY_ADDRESS: escapeHtml(propertyAddress.full),
      PROPERTY_SHORT_ADDRESS: escapeHtml(propertyAddress.short),
      MONTHLY_RENT: emailMoneyCompact(monthlyRent),
      SECURITY_DEPOSIT: emailMoneyCompact(securityDeposit),
      HOLDING_DEPOSIT: emailMoneyCompact(holdingDeposit),
      APPLICATION_URL: escapeHtml(applicationFormUrl),
    }),
  };
}

export function tenancyApplicationEmail(
  name: string,
  address: string,
  monthlyRent: number,
  securityDeposit: number,
  holdingDeposit: number,
  applicationFormUrl: string
): { subject: string; html: string } {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 14);
  const deadlineStr = deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    subject: `Tenancy Application – ${address}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #25073B, #DC006D); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 22px;">Fleming Lettings</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">Tenancy Application</p>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #eee; border-top: none;">
          <p style="font-size: 15px; color: #333;">Dear <span style="background: #fff3cd; padding: 2px 4px;">${name}</span>,</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Thank you for your interest in renting <strong><span style="background: #fff3cd; padding: 2px 4px;">${address}</span></strong>. We are pleased to invite you to complete your tenancy application.
          </p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Please review the financial details below and complete your application within <strong>14 days</strong> (by <span style="background: #fff3cd; padding: 2px 4px;">${deadlineStr}</span>).
          </p>

          <h3 style="font-size: 15px; color: #333; margin: 24px 0 12px; border-bottom: 2px solid #DC006D; padding-bottom: 8px;">Financial Summary</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">
            <tr style="background: #f8f8f8;">
              <td style="padding: 12px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Monthly Rent</td>
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">&pound;<span style="background: #fff3cd; padding: 2px 4px;">${monthlyRent.toLocaleString()}</span></td>
            </tr>
            <tr>
              <td style="padding: 12px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Security Deposit</td>
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">&pound;<span style="background: #fff3cd; padding: 2px 4px;">${securityDeposit.toLocaleString()}</span></td>
            </tr>
            <tr style="background: #f0f8ff;">
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #DC006D; border-bottom: 2px solid #DC006D;">Holding Deposit</td>
              <td style="padding: 12px 16px; font-size: 16px; font-weight: 700; color: #DC006D; text-align: right; border-bottom: 2px solid #DC006D;">&pound;<span style="background: #fff3cd; padding: 2px 4px;">${holdingDeposit.toLocaleString()}</span></td>
            </tr>
          </table>

          <h3 style="font-size: 15px; color: #333; margin: 24px 0 12px; border-bottom: 2px solid #DC006D; padding-bottom: 8px;">Bank Details for Payment</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">
            <tr style="background: #f8f8f8;">
              <td style="padding: 10px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Account Name</td>
              <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">Fleming Lettings and Developments UK Limited</td>
            </tr>
            <tr>
              <td style="padding: 10px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Bank</td>
              <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">Barclays</td>
            </tr>
            <tr style="background: #f8f8f8;">
              <td style="padding: 10px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Sort Code</td>
              <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">20-08-64</td>
            </tr>
            <tr>
              <td style="padding: 10px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Account Number</td>
              <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">03803880</td>
            </tr>
          </table>

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Please complete your tenancy application by clicking the button below:
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${applicationFormUrl}" style="display: inline-block; background: linear-gradient(135deg, #DC006D, #a5004f); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
              Complete Tenancy Application
            </a>
          </div>
          <p style="font-size: 13px; color: #888; line-height: 1.6;">
            Please ensure your application is completed by <strong>${deadlineStr}</strong>. Failure to complete within this timeframe may result in the property being offered to another applicant.
          </p>
          <p style="font-size: 13px; color: #555; line-height: 1.6;">
            You can save your application and resume it later by reopening this same secure link.
          </p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            If you have any questions, please don't hesitate to contact our team.
          </p>
          <p style="font-size: 14px; color: #555;">
            Kind regards,<br/><strong>Lettings Support Team | fleminglettings.co.uk</strong><br/>
            <span style="font-size: 12px; color: #888;">01902 212 415 | contact@tenancies.fleminglettings.co.uk</span>
          </p>
        </div>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 0 0 12px 12px; text-align: center; border: 1px solid #eee; border-top: none;">
          <p style="font-size: 11px; color: #999; margin: 0;">
            Fleming Lettings and Developments UK Limited<br/>
            Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG
          </p>
        </div>
      </div>
    `,
  };
}

export function enquiryConfirmationEmail(name: string, reference: string, propertyAddress?: string | null): { subject: string; html: string } {
  return {
    subject: 'Welcome to Fleming Lettings!',
    html: renderFinalEmailTemplate('01-welcome.html', {
      FIRST_NAME: escapeHtml(name || 'there'),
      REFERENCE: escapeHtml(reference),
    }),
  };
}

export function applicationConfirmationEmail(name: string): { subject: string; html: string } {
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'there';
  return {
    subject: 'Thank you for completing your application form',
    html: renderFinalEmailTemplate('04-application-received.html', {
      FIRST_NAME: escapeHtml(firstName),
    }),
  };
}

export function holdingDepositReceiptEmail(name: string, amount: number, receivedDate: string): { subject: string; html: string } {
  const displayDate = new Date(`${receivedDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    subject: 'Confirmation of receipt of your holding deposit',
    html: brandedEmailHtml('Holding Deposit Received', `
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>We confirm that Fleming Lettings received your holding deposit of <strong>£${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> on <strong>${displayDate}</strong>.</p>
      <p>We will continue progressing your tenancy application and contact you if anything else is required.</p>
    `),
  };
}

export function genericEmail(name: string, topic: string): { subject: string; html: string } {
  return {
    subject: topic,
    html: brandedEmailHtml(topic, `
        <p>Hi ${name},</p>
        <p>Thank you for your enquiry. We wanted to follow up regarding ${topic.toLowerCase()}.</p>
        <p>Please don't hesitate to get in touch if you have any questions.</p>
    `),
  };
}
