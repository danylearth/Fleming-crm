import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export const OUTBOUND_EMAIL_ADDRESS = 'contact@tenancies.fleminglettings.co.uk';
export const EMAIL_FROM = `Fleming Lettings <${OUTBOUND_EMAIL_ADDRESS}>`;
const ALLOW_SIMULATED_MESSAGES = process.env.ALLOW_SIMULATED_MESSAGES === 'true' && process.env.NODE_ENV !== 'production';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
  const propertyAddress = escapeHtml(input.propertyAddress);
  const landlord = `${escapeHtml(input.landlordName)}${input.landlordAddress ? `<br><span style="font-weight:normal;color:#1E1E1E">${escapeHtml(input.landlordAddress)}</span>` : ''}`;
  const message = escapeHtml(input.customMessage || `Your tenancy agreement for ${input.propertyAddress} is ready to review and sign.`).replace(/\r?\n/g, '<br>');
  return {
    subject: 'Your tenancy agreement is ready to sign',
    html: brandedEmailHtml('Tenancy agreement', `
      <h1 style="font-size:34px;line-height:40px;color:#27083D;margin:0 0 18px">Hi ${escapeHtml(input.firstName || 'there')},</h1>
      <p>${message}</p>
      <div style="background:#563F6E;padding:22px 24px;margin:24px 0;color:#ffffff"><span style="font-size:14px;color:#EEEEEE">Property</span><br><strong style="font-size:22px">${propertyAddress}</strong></div>
      <h2 style="font-size:20px;color:#27083D;margin:28px 0 14px">Agreement summary</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 4px">
        ${emailSummaryRow('Tenancy type', 'Assured Shorthold Tenancy')}
        ${emailSummaryRow('Start date', emailDate(input.tenancyStartDate))}
        ${emailSummaryRow('Landlord', landlord)}
        ${emailSummaryRow('Monthly rent', `&pound;${emailMoney(input.monthlyRent)}`)}
        ${emailSummaryRow('Security deposit', `&pound;${emailMoney(input.securityDeposit)}`)}
        ${emailSummaryRow('Funds already on account', `&pound;${emailMoney(input.fundsOnAccount)}`)}
        ${emailSummaryRow('Balance due before move in', `&pound;${emailMoney(input.balanceDue)}`, true)}
      </table>
      <p>All of the property’s compliance documentation is attached for your records.</p>
      <p>Once you have completed and signed your tenancy agreement, you will be emailed the completed documents on a new thread.</p>
      <p><a href="${escapeHtml(input.signingUrl)}" style="display:inline-block;background:#DC006D;color:#ffffff;text-decoration:none;padding:15px 32px;font-weight:bold">Review and sign agreement</a></p>
    `),
  };
}

export function completedTenancyAgreementEmail(firstName: string, propertyAddress: string): { subject: string; html: string } {
  const replySubject = encodeURIComponent(`Completed tenancy agreement - ${propertyAddress}`);
  return {
    subject: 'Copy of your completed tenancy agreement',
    html: brandedEmailHtml('Completed agreement', `
      <h1 style="font-size:34px;line-height:40px;color:#27083D;margin:0 0 18px">Hi ${escapeHtml(firstName || 'there')},</h1>
      <p>Please see attached your completed copy of your Assured Shorthold Tenancy agreement.</p>
      <div style="background:#563F6E;padding:22px 24px;margin:24px 0;color:#ffffff"><span style="font-size:14px;color:#EEEEEE">Property</span><br><strong style="font-size:22px">${escapeHtml(propertyAddress)}</strong></div>
      <p>If you have any questions, reply to this email or call us on <a href="tel:+441902212415" style="color:#DC006D">01902 212 415</a>.</p>
      <p><a href="mailto:${OUTBOUND_EMAIL_ADDRESS}?subject=${replySubject}" style="display:inline-block;background:#DC006D;color:#ffffff;text-decoration:none;padding:15px 32px;font-weight:bold">Reply to this email</a></p>
    `),
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
  const replySubject = encodeURIComponent(`Final balance and handover - ${input.propertyAddress}`);
  return {
    subject: 'Final balance and handover',
    html: brandedEmailHtml('Final balance and handover', `
      <h1 style="font-size:34px;line-height:40px;color:#27083D;margin:0 0 18px">Hi ${escapeHtml(input.firstName || 'there')},</h1>
      <p>${escapeHtml(input.customMessage || `Your tenancy agreement has been completed. The remaining balance for ${input.propertyAddress} is set out below.`).replace(/\r?\n/g, '<br>')}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 4px;margin:24px 0">
        ${emailSummaryRow('Security deposit', `&pound;${emailMoney(input.securityDeposit)}`)}
        ${emailSummaryRow('First month’s rent', `&pound;${emailMoney(input.monthlyRent)}`)}
        ${emailSummaryRow('Holding deposit already received', `&minus;&pound;${emailMoney(input.holdingDeposit)}`)}
        ${emailSummaryRow('Remaining balance', `&pound;${emailMoney(input.balanceDue)}`, true)}
      </table>
      <h2 style="font-size:20px;color:#27083D;margin:28px 0 14px">Bank details for payment</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 4px">
        ${emailSummaryRow('Bank', escapeHtml(input.bankDetails.bankName))}
        ${emailSummaryRow('Account name', escapeHtml(input.bankDetails.accountName))}
        ${emailSummaryRow('Sort code', escapeHtml(input.bankDetails.sortCode))}
        ${emailSummaryRow('Account number', escapeHtml(input.bankDetails.accountNumber))}
        ${emailSummaryRow('Payment reference', escapeHtml(input.paymentReference), true)}
      </table>
      <p>Please contact your lettings manager or our office once payment has been made so we can confirm receipt.</p>
      <p>Once the funds have been received, we can arrange a preferred date and time on site for the handover and inventory.</p>
      <p><a href="mailto:${OUTBOUND_EMAIL_ADDRESS}?subject=${replySubject}" style="display:inline-block;background:#DC006D;color:#ffffff;text-decoration:none;padding:15px 32px;font-weight:bold">Reply with your preferred time</a></p>
      <p>If you have any questions, reply to this email or call us on <a href="tel:+441902212415" style="color:#DC006D">01902 212 415</a>.</p>
    `),
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
  const propertyAddress = escapeHtml(input.propertyAddress);
  const mapQuery = encodeURIComponent(input.propertyAddress);
  const date = input.appointmentDate instanceof Date
    ? input.appointmentDate
    : new Date(`${String(input.appointmentDate).slice(0, 10)}T12:00:00Z`);
  const displayDate = Number.isNaN(date.getTime())
    ? escapeHtml(input.appointmentDate)
    : date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const intro = escapeHtml(input.customMessage || 'Finally, we’re nearly there! Your move in and handover appointment is confirmed. We will meet you at the property to conduct the inventory, hand over the keys and answer any final questions that you may have.').replace(/\r?\n/g, '<br>');
  return {
    subject: 'Your move in and handover date',
    html: brandedEmailHtml('Your move in date', `
      <h1 style="font-size:34px;line-height:40px;color:#27083D;margin:0 0 18px">Hi ${escapeHtml(input.firstName || 'there')},</h1>
      <p>${intro}</p>
      <div style="background:#563F6E;padding:24px;margin:24px 0;color:#ffffff">
        <span style="font-size:14px;color:#EEEEEE">Your appointment</span><br>
        <strong style="font-size:28px;line-height:38px">${displayDate}</strong><br>
        <strong style="font-size:22px;line-height:32px">${escapeHtml(input.appointmentTime)}</strong>
        <div style="padding-top:14px;color:#EEEEEE">Your appointment is with</div>
        <strong style="font-size:19px">${escapeHtml(input.appointmentWith)}</strong>
        <div style="padding-top:14px;color:#EEEEEE">Meeting at</div>
        <strong style="font-size:19px">${propertyAddress}</strong>
      </div>
      <p>Please arrive on time. If you are running late or need us to wait a little longer, call us on <a href="tel:+441902212415" style="color:#DC006D">01902 212 415</a>.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:8px 0;margin:24px -8px 0">
        <tr>
          <td style="width:50%;background:#FCE9F2;border-left:4px solid #DC006D;padding:18px"><a href="https://www.google.com/maps/search/?api=1&amp;query=${mapQuery}" style="color:#27083D;text-decoration:none;font-weight:bold">Google Maps<br><span style="font-size:13px;font-weight:normal;color:#563F6E">Get directions</span></a></td>
          <td style="width:50%;background:#FCE9F2;border-left:4px solid #563F6E;padding:18px"><a href="https://maps.apple.com/?q=${mapQuery}" style="color:#27083D;text-decoration:none;font-weight:bold">Apple Maps<br><span style="font-size:13px;font-weight:normal;color:#563F6E">Get directions</span></a></td>
        </tr>
      </table>
    `),
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
  const escapedChanges = String(changes)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, '<br/>');
  return {
    subject: 'More information required for your tenancy application',
    html: brandedEmailHtml('Application Review', `
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>Thank you for completing your application forms with Fleming Lettings. We have reviewed your application and still require further information or documentation from you.</p>
      <h3 style="font-size:15px;color:#25073B;margin:24px 0 10px">What we need to complete your application:</h3>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px">${escapedChanges}</div>
      <p>Please use your secure link to update the application:</p>
      <p><a href="${applicationUrl}" style="display:inline-block;background:#DC006D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Update your application</a></p>
      <p>If you need any help, please contact our office on 01902 212 415.</p>
    `),
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
  const cleanAddress = normalizePropertyAddress(address);
  const mapQuery = encodeURIComponent(cleanAddress);
  return {
    subject: `Your viewing with Fleming Lettings at ${cleanAddress}`,
    html: brandedEmailHtml('Viewing Confirmation', `
        <p>Hi ${escapeHtml(name || 'there')},</p>
        <p>This is to confirm your viewing at:</p>
        <div style="background:#563F6E;padding:18px;border-radius:4px;margin:16px 0;color:#ffffff">
          <strong>${escapeHtml(cleanAddress)}</strong><br/>
          <span style="color:#EEC9DF">Date: ${escapeHtml(date)}</span>
        </div>
        <p>Please arrive on time, or if you're running late or need us to hang on for a little longer, please call us on <a href="tel:01902212415" style="color:#DC006D">01902 212 415</a>.</p>
        <p><strong>Get directions</strong></p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          <td width="49%" style="background:#F5E8F0;border-left:4px solid #DC006D;padding:16px"><a href="https://www.google.com/maps/search/?api=1&amp;query=${mapQuery}" style="color:#25073B;text-decoration:none;font-weight:bold">Google Maps<br><span style="font-weight:normal;font-size:12px">Click to get directions</span></a></td>
          <td width="2%"></td>
          <td width="49%" style="background:#F5E8F0;border-left:4px solid #563F6E;padding:16px"><a href="https://maps.apple.com/?q=${mapQuery}" style="color:#25073B;text-decoration:none;font-weight:bold">Apple Maps<br><span style="font-weight:normal;font-size:12px">Click to get directions</span></a></td>
        </tr></table>
        <p>We look forward to seeing you soon and showing you around!</p>
      `),
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
  const safeName = escapeHtml(name || 'there');
  const safeAddress = escapeHtml(address);
  const safeApplicationUrl = escapeHtml(applicationFormUrl);
  return {
    subject: `Holding Deposit Request - ${address}`,
    html: brandedEmailHtml('Holding deposit request', `
      <h1 style="font-size:34px;line-height:40px;color:#27083D;margin:0 0 18px">Dear ${safeName},</h1>
      <p>Thank you for your interest in <strong>${safeAddress}</strong>. We are pleased to confirm that we would like to proceed with your application.</p>
      <p>To secure this property, we require an initial holding deposit. Please see the financial summary below:</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0">
        <tr><td style="padding:14px 18px;background:#EEEEEE">Monthly Rent</td><td align="right" style="padding:14px 18px;background:#EEEEEE;font-weight:bold;color:#27083D">&pound;${monthlyRent.toLocaleString()}</td></tr>
        <tr><td style="height:4px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:14px 18px;background:#EEEEEE">Security Deposit</td><td align="right" style="padding:14px 18px;background:#EEEEEE;font-weight:bold;color:#27083D">&pound;${securityDeposit.toLocaleString()}</td></tr>
        <tr><td style="height:4px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:18px;background:#563F6E;color:#ffffff;font-weight:bold">Holding Deposit (due now)</td><td align="right" style="padding:18px;background:#563F6E;color:#ffffff;font-size:22px;font-weight:bold">&pound;${holdingDeposit.toLocaleString()}</td></tr>
      </table>
      <p>Please complete your application and review the holding deposit terms by clicking the button below:</p>
      <p><a href="${safeApplicationUrl}" style="display:inline-block;background:#DC006D;color:#ffffff;text-decoration:none;padding:15px 32px;font-weight:bold">Complete Application &amp; Review Terms</a></p>
      <p>Please review the holding deposit information and financial summary above carefully before making any payment.</p>
      <p>Struggling to do it all at once? You can save your application and pick up where you left off at any time by opening this link again.</p>
      <p>If you have any questions, please don't hesitate to contact us.</p>
    `),
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
  const safeName = escapeHtml(name || 'there');
  const safeReference = escapeHtml(reference);
  const safeProperty = propertyAddress ? escapeHtml(propertyAddress) : '';
  return {
    subject: 'Welcome to Fleming Lettings!',
    html: `<!doctype html><html><body style="margin:0;background:#f4f1f6;font-family:Arial,sans-serif;color:#332b37">
      <div style="display:none;max-height:0;overflow:hidden">We have received your Fleming Lettings enquiry. Reference ${safeReference}.</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1f6"><tr><td align="center" style="padding:24px 12px">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px;overflow:hidden">
          <tr><td style="background:#27083D;padding:30px;text-align:center;color:#fff"><div style="font-size:26px;font-weight:800;letter-spacing:.5px">FLEMING LETTINGS</div><div style="margin-top:7px;color:#e6cfe9;font-size:13px">Welcome to Fleming Lettings!</div></td></tr>
          <tr><td style="padding:36px 34px 28px">
            <p style="font-size:18px;font-weight:700;margin:0 0 18px;color:#27083D">Hi there ${safeName}!</p>
            <p style="font-size:15px;line-height:1.7;margin:0 0 18px">Thank you for registering with Fleming Lettings. We have received your application${safeProperty ? ` regarding <strong>${safeProperty}</strong>` : ''} and our lettings team will review it in due course.</p>
            <div style="background:#f7f2f8;border-left:4px solid #DC006D;padding:16px 18px;margin:22px 0;border-radius:6px"><span style="font-size:13px;color:#6f6474">Your reference</span><br><strong style="font-size:20px;color:#27083D">${safeReference}</strong></div>
            <p style="font-size:14px;line-height:1.7">We retain your information in line with our <a href="https://fleminglettings.co.uk/privacy-policy" style="color:#DC006D">Privacy Policy</a> to support your property application and help find other suitable properties. You can ask us to remove your information at any time, subject to our legal obligations.</p>
            <p style="font-size:14px;line-height:1.7;margin-bottom:0">If you have any questions, reply to this email or call us on <strong>01902 212 415</strong> quoting your reference.</p>
          </td></tr>
          <tr><td style="background:linear-gradient(135deg,#27083D,#DC006D);padding:24px;text-align:center;color:#fff"><strong style="font-size:18px">All of your property needs</strong><br><span style="font-size:14px">Without any of the hassle</span></td></tr>
          <tr><td style="background:#f7f5f7;padding:18px 28px;text-align:center;font-size:10px;line-height:1.5;color:#827987">Fleming Lettings and Developments UK Limited · Company 13943597<br>Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG</td></tr>
        </table>
      </td></tr></table></body></html>`,
  };
}

export function applicationConfirmationEmail(name: string): { subject: string; html: string } {
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'there';
  return {
    subject: 'Thank you for completing your application form',
    html: brandedEmailHtml('Application Received', `
          <p style="font-size: 15px; color: #333;">Dear ${escapeHtml(firstName)},</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">Thank you for completing your application form.</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">Our office team will review your application and be in touch with you within the next 48 hours.</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">Please note that we may still require additional information or documentation from you to complete our checks. If so, a member of our team will contact you.</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">If you have any questions, reply to this email or call us on <strong>01902 212 415</strong>.</p>
      `),
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
