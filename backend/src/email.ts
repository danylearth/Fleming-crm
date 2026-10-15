import {normalizePropertyAddress} from './property-address';
export {normalizePropertyAddress} from './property-address';
import {prepareEmailHtml} from './email-presentation';
import {addEmailFooter} from './email-footer';
import {emailPreferencesUrl} from './email-preferences';
import { Resend } from 'resend';
import {loginCodeEmail} from './login-code-email';
import fs from 'fs';
import path from 'path';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const configuredSender = process.env.EMAIL_FROM?.trim() || 'contact@tenancies.fleminglettings.co.uk';
export const OUTBOUND_EMAIL_ADDRESS = configuredSender.match(/<([^<>]+)>/)?.[1]?.trim() || configuredSender;
if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(OUTBOUND_EMAIL_ADDRESS)) throw new Error('EMAIL_FROM must contain a valid email address');
export const EMAIL_FROM = `Fleming Lettings <${OUTBOUND_EMAIL_ADDRESS}>`;
export const SECURITY_EMAIL_ADDRESS = 'no-reply@fleminglettings.co.uk';
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
  // Email clients need absolute, publicly reachable image URLs.
  html = html.replace(/src="assets\//g, 'src="https://crm.fleminglettings.co.uk/email-assets/');
  return prepareEmailHtml(html);
}

function addressParts(address: string): { full: string; short: string; remainder: string } {
  const full = normalizePropertyAddress(address);
  const [short, ...remainder] = full.split(',').map(part => part.trim()).filter(Boolean);
  return { full, short: short || full, remainder: remainder.join(', ') };
}

function emailMoneyCompact(value: number): string {
  return Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function emailTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return escapeHtml(value);
  const hour = Number(match[1]);
  if (hour > 23) return escapeHtml(value);
  return `${hour % 12 || 12}:${match[2]}${hour < 12 ? 'am' : 'pm'}`;
}

export interface SendEmailParams {
  fromEmail?: string;
  idempotencyKey?: string;
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
  return prepareEmailHtml(`<!doctype html><html><body style="margin:0;background:#EEEEEE;font-family:Helvetica,Arial,sans-serif;color:#1E1E1E">
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
    </td></tr></table></body></html>`);
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
  isExistingTenant?: boolean;
}

export function revisedAgreementNotice(firstName:string,propertyAddress:string,signingUrl:string,waitingForLandlord:boolean){
 return {subject:'Your tenancy agreement has been updated — new signatures required',html:brandedEmailHtml('Updated tenancy agreement',`<p>Hi ${escapeHtml(firstName)},</p><p>The tenancy agreement for ${escapeHtml(propertyAddress)} has been edited. All parties must review and sign the revised version. Previous signatures do not apply to it.</p><p>${waitingForLandlord?'The landlord will sign first. We will send your signing invitation as soon as all landlords have signed.':'Please review the revised agreement and sign again.'}</p>${waitingForLandlord?'':`<p><a href="${escapeHtml(signingUrl)}">Review and sign the revised agreement</a></p>`}`)};
}

export function tenancyAgreementEmail(input: TenancyAgreementEmailInput): { subject: string; html: string } {
  const address = addressParts(input.propertyAddress);
  const landlordAddress = (input.landlordAddress || '').replace(/,?\s*(?:West Midlands|Glaisher Drive),?/gi, /fleming/i.test(input.landlordName)?',':'$&');
  const landlordAddressHtml = escapeHtml(landlordAddress).replace(/([^,]+),\s*([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i, (_match, town, postcode) => ` <span style="white-space:nowrap">${town.trim()}, ${postcode}</span>`);
  let html = renderFinalEmailTemplate('06-tenancy-agreement.html', {
      FIRST_NAME: escapeHtml(input.firstName || 'there'),
      PROPERTY_ADDRESS: escapeHtml(address.full),
      PROPERTY_SHORT_ADDRESS: escapeHtml(address.short),
      PROPERTY_ADDRESS_REMAINDER: escapeHtml(address.remainder),
      INTRO_MESSAGE: escapeHtml(input.customMessage || `Your tenancy agreement for ${address.full} is ready to review and sign.`).replace(/\r?\n/g, '<br>'),
      TENANCY_START_DATE: emailDate(input.tenancyStartDate),
      LANDLORD_NAME: escapeHtml(input.landlordName),
      LANDLORD_ADDRESS: landlordAddressHtml,
      MONTHLY_RENT: emailMoneyCompact(input.monthlyRent),
      SECURITY_DEPOSIT: emailMoneyCompact(input.securityDeposit),
      FUNDS_ON_ACCOUNT: emailMoneyCompact(input.fundsOnAccount),
      BALANCE_DUE: emailMoneyCompact(input.isExistingTenant ? Math.max(0, input.monthlyRent + input.securityDeposit) : input.balanceDue),
      SIGNING_URL: escapeHtml(input.signingUrl),
    });
  if(input.isExistingTenant)html=html.replace(/<!-- HOLDING_DEPOSIT_START -->[\s\S]*?<!-- HOLDING_DEPOSIT_END -->/,'');
  return {subject: 'Your tenancy agreement is ready to sign',html};
}

export function completedTenancyAgreementEmail(firstName: string, propertyAddress: string): { subject: string; html: string } {
  const address = addressParts(propertyAddress);
  return {
    subject: 'Copy of your completed tenancy agreement',
    html: renderFinalEmailTemplate('07-completed-tenancy-agreement.html', {
      FIRST_NAME: escapeHtml(firstName || 'there'),
      PROPERTY_SHORT_ADDRESS: escapeHtml(address.short),
      PROPERTY_ADDRESS_REMAINDER: escapeHtml(address.remainder),
    }),
  };
}

export function completedDocumentEmail(name:string,title:string,signedAt:string|Date,propertyAddress=''){
 const firstName=name.trim().replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i,'').split(/\s+/)[0]||'there';
 const documentName=title.replace(/\.(pdf|docx?|html?)$/i,'');
 const label=propertyAddress&&!documentName.toLowerCase().includes(propertyAddress.split(',')[0].toLowerCase())?`${documentName} - ${propertyAddress}`:documentName;
 return {subject:'Your signed document - '+documentName,html:renderFinalEmailTemplate('signed-document.html',{
  FIRST_NAME:escapeHtml(firstName),DOCUMENT_LABEL:escapeHtml(label),
  DATE_SIGNED:escapeHtml(new Date(signedAt).toLocaleDateString('en-GB',{timeZone:'Europe/London'})),
 })};
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

export function maintenanceReportingEmail(
  firstName: string,
  propertyAddress: string,
  reportUrl: string,
): { subject: string; html: string } {
  return {
    subject: 'Report a maintenance issue to Fleming Lettings',
    html: renderFinalEmailTemplate('10-maintenance-reporting.html', {
      FIRST_NAME: escapeHtml(firstName || 'there'),
      PROPERTY_ADDRESS: escapeHtml(normalizePropertyAddress(propertyAddress)),
      REPORT_URL: escapeHtml(reportUrl),
    }),
  };
}

export interface HandoverAppointmentEmailInput {
  appointmentLocation?: string;
  firstName: string;
  propertyAddress: string;
  appointmentDate: string | Date;
  appointmentTime: string;
  appointmentWith: string;
  customMessage?: string | null;
}

export function handoverAppointmentEmail(input: HandoverAppointmentEmailInput): { subject: string; html: string } {
  const address = addressParts(input.propertyAddress);
  const location = input.appointmentLocation || address.full;
  const mapQuery = encodeURIComponent(location);
  const date = input.appointmentDate instanceof Date
    ? input.appointmentDate
    : new Date(`${String(input.appointmentDate).slice(0, 10)}T12:00:00Z`);
  const displayDate = Number.isNaN(date.getTime())
    ? escapeHtml(input.appointmentDate)
    : date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).replace(',', '');
  const intro = escapeHtml(input.customMessage || "Finally, we're nearly there! Your move in and handover appointment is confirmed. We will meet you at the location below to hand over the keys and answer any final questions that you may have.").replace(/\r?\n/g, '<br>');
  return {
    subject: 'Your move in and handover date',
    html: renderFinalEmailTemplate('09-move-in-date.html', {
      APPOINTMENT_LOCATION: escapeHtml(location),
      FIRST_NAME: escapeHtml(input.firstName || 'there'),
      PROPERTY_ADDRESS: escapeHtml(address.full),
      PROPERTY_SHORT_ADDRESS: escapeHtml(address.short),
      APPOINTMENT_DATE: displayDate,
      APPOINTMENT_TIME: emailTime(input.appointmentTime),
      APPOINTMENT_WITH: escapeHtml(input.appointmentWith),
      INTRO_MESSAGE: intro,
      GOOGLE_MAP_URL: escapeHtml(`https://www.google.com/maps/search/?api=1&query=${mapQuery}`),
      APPLE_MAP_URL: escapeHtml(`https://maps.apple.com/?q=${mapQuery}`),
    }),
  };
}


export function applicationChangesRequestedEmail(name: string, changes: string, applicationUrl: string): { subject: string; html: string } {
  return {
    subject: 'More information required for your tenancy application',
    html: renderFinalEmailTemplate('05-application-review.html', {
      FIRST_NAME: escapeHtml(name?.trim().split(/\s+/)[0] || 'there'),
      REQUESTED_CHANGES: escapeHtml(changes).replace(/\r?\n/g, '<br>'),
      APPLICATION_URL: escapeHtml(applicationUrl),
    }),
  };
}

// Embed supplied branding assets in the message itself; saved previews retain public URLs.
export function inlineEmailImages(html: string) {
  const assets = new Map<string, { filename: string; content: Buffer; contentType: string; contentId: string }>();
  let rendered = html.replace(/src="https:\/\/crm\.fleminglettings\.co\.uk\/email-assets\/([a-zA-Z0-9_-]+\.(?:png|jpg))"/g, (original, filename: string) => {
    const file = path.join(__dirname, 'email-assets', filename);
    if (!fs.existsSync(file)) return original;
    const contentId = `fleming-${filename}`;
    if (!assets.has(filename)) assets.set(filename, { filename, content: fs.readFileSync(file), contentType: filename.endsWith('.png') ? 'image/png' : 'image/jpeg', contentId });
    return `src="cid:${contentId}"`;
  });
  rendered = rendered.replace(/https?:\/\/[^\s"'<>\)]+\/api\/public\/email-images\/([a-f0-9]{64}\.(?:png|webp))/g, (original, filename: string) => {
    const allowed = ['https://fleming-crm-api.fly.dev', 'https://crm.fleminglettings.co.uk', process.env.BASE_URL].flatMap(value => { try { return value ? [new URL(value).origin] : []; } catch { return []; } });
    if (!allowed.includes(new URL(original).origin)) return original;
    const file = path.join(process.env.UPLOADS_PATH || path.join(__dirname, '../uploads'), 'email-images', filename);
    if (!fs.existsSync(file)) throw Error('An email image is missing. Upload the email folder again.');
    const contentId = 'fleming-upload-' + filename;
    if (!assets.has(contentId)) assets.set(contentId, { filename, content: fs.readFileSync(file), contentType: filename.endsWith('.png') ? 'image/png' : 'image/webp', contentId });
    return 'cid:' + contentId;
  });
  return { html: rendered, attachments: [...assets.values()] };
}

// Transactional security mail must never simulate delivery or add marketing opt-out links.
export async function sendLoginVerificationEmail(to:string,code:string,name='there'):Promise<boolean> {
  if(!resend||process.env.ALLOW_SIMULATED_MESSAGES==='true'||!/^\d{6}$/.test(code))return false;
  try {
    const inline=inlineEmailImages(loginCodeEmail(name,code));
    const {data,error}=await resend.emails.send({from:`Fleming Lettings <${SECURITY_EMAIL_ADDRESS}>`,to,subject:'Your Fleming Lettings sign-in verification code',html:inline.html,attachments:inline.attachments});
    if(error||!data?.id){console.error('[2FA] Email verification delivery rejected');return false;}
    return true;
  }catch{console.error('[2FA] Email verification delivery failed');return false;}
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
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    if (!recipients.length) return {success:false,error:'Choose an email recipient'};
    // Each recipient gets their own preferences link, including group messages.
    const preferences = await Promise.all(recipients.map(emailPreferencesUrl));
    let firstId: string | undefined;
    for (const [index, recipient] of recipients.entries()) {
    const inline = inlineEmailImages(prepareEmailHtml(addEmailFooter(params.html, preferences[index])));
    const { data, error } = await resend.emails.send({
      from: params.fromEmail ? `Fleming Lettings <${params.fromEmail}>` : EMAIL_FROM,
      to: recipient,
      subject: params.subject,
      html: inline.html,
      replyTo: params.fromEmail || OUTBOUND_EMAIL_ADDRESS,
      attachments: [...(params.attachments || []), ...inline.attachments],
    }, params.idempotencyKey ? { idempotencyKey: recipients.length > 1 ? `${params.idempotencyKey}-${index}` : params.idempotencyKey } : undefined);

    if (error) {
      console.error('[EMAIL ERROR]', error);
      return { success: false, error: index ? `${index} recipient(s) sent; delivery to the next recipient failed: ${error.message}` : error.message };
    }

    firstId ||= data?.id;
    }
    return { success: true, id: firstId };
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
    subject: `Your viewing at ${cleanAddress.full}`,
    html: renderFinalEmailTemplate('02-viewing-confirmation.html', {
      FIRST_NAME: escapeHtml(name?.trim().split(/\s+/)[0] || 'there'),
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
    html: renderFinalEmailTemplate('14-rent-overdue.html', { FIRST_NAME:escapeHtml(tenantName), AMOUNT:escapeHtml(amount.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})), PROPERTY_ADDRESS:escapeHtml(address), DUE_DATE:escapeHtml(new Date(dueDate.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})), PROPERTY_SUBJECT:encodeURIComponent(address) }).replace('your rent payment has not been received','your rent payment has an outstanding balance').replace(/overdue/gi, dueDate.slice(0,10)===new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date())?'due today':'overdue'),
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
  holdingDeposit: number, applicationFormUrl: string, payment: ReturnType<typeof import('./holding-deposit-bank').holdingDepositBank>, customMessage?: string | null
): { subject: string; html: string } {
  const propertyAddress = addressParts(address);
  return {
    subject: `Holding Deposit Request - ${address}`,
    html: renderFinalEmailTemplate('03-holding-deposit.html', {
      FIRST_NAME: escapeHtml(name?.trim().split(/\s+/)[0] || 'there'),
      PROPERTY_ADDRESS: escapeHtml(propertyAddress.full),
      PROPERTY_SHORT_ADDRESS: escapeHtml(propertyAddress.short),
      MONTHLY_RENT: emailMoneyCompact(monthlyRent),
      SECURITY_DEPOSIT: emailMoneyCompact(securityDeposit),
      HOLDING_DEPOSIT: emailMoneyCompact(holdingDeposit),
      PAYMENT_ACCOUNT_LABEL: escapeHtml(payment.accountLabel),
      PAYMENT_ACCOUNT_NAME: escapeHtml(payment.accountName),
      PAYMENT_BANK_NAME: escapeHtml(payment.bankName),
      PAYMENT_SORT_CODE: escapeHtml(payment.sortCode),
      PAYMENT_ACCOUNT_NUMBER: escapeHtml(payment.accountNumber),
      PAYMENT_REFERENCE: escapeHtml(propertyAddress.short),
      APPLICATION_URL: escapeHtml(applicationFormUrl),
      INTRO_MESSAGE: escapeHtml(customMessage || `Thank you for your interest in ${propertyAddress.full}. We are pleased to confirm that we would like to proceed with your application.\n\nTo secure this property, we require an initial holding deposit. Please see the financial summary below:`).replace(/\r?\n/g, '<br>'),
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
      FIRST_NAME: escapeHtml(name?.trim() || 'there'),
      REFERENCE: escapeHtml(reference),
    }),
  };
}

export function applicationConfirmationEmail(name: string): { subject: string; html: string; fromEmail: string } {
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'there';
  return {
    fromEmail: 'tenancies@fleminglettings.co.uk',
    subject: 'Thank you for completing your application form',
    html: renderFinalEmailTemplate('04-application-received.html', {
      FIRST_NAME: escapeHtml(firstName),
    }),
  };
}

export function holdingDepositReceiptEmail(name: string, amount: number, receivedDate: string, customMessage?: string | null): { subject: string; html: string } {
  const displayDate = new Date(`${receivedDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    subject: 'Confirmation of receipt of your holding deposit',
    html: renderFinalEmailTemplate('04-holding-deposit-receipt.html', {
      FIRST_NAME: escapeHtml(String(name || '').trim().split(/\s+/)[0] || 'there'),
      AMOUNT: emailMoney(amount),
      RECEIVED_DATE: displayDate,
      INTRO_MESSAGE: escapeHtml(customMessage || `We confirm that Fleming Lettings received your holding deposit of £${emailMoney(amount)} on ${displayDate}.`).replace(/\r?\n/g, '<br>'),
    }),
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

export function tenancyEndEmail(firstName: string, propertyAddress: string, endDate: string): { subject: string; html: string; sms: string } {
  const date = new Date(`${endDate}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).replace(',', '');
  const address = normalizePropertyAddress(propertyAddress);
  return {
    subject: `Your tenancy end date – ${address}`,
    html: renderFinalEmailTemplate('11-tenancy-end.html', { FIRST_NAME: escapeHtml(firstName || 'there'), END_DATE: escapeHtml(date), PROPERTY_ADDRESS: escapeHtml(address), PROPERTY_SUBJECT: encodeURIComponent(address) }),
    sms: `Hi ${firstName || 'there'}, we can confirm that your tenancy agreement is set to end on ${date}. If you wish to change or discuss this further, then please contact our office on 01902 212 415.`,
  };
}

export function propertyInventoryEmail(name: string, address: string, dueDate: string, reviewLink: string): string {
  return renderFinalEmailTemplate('12-property-inventory.html', {
    TENANT_NAME:escapeHtml(name), PROPERTY_ADDRESS:escapeHtml(address),
    DUE_DATE:escapeHtml(new Date(dueDate.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})),
    REVIEW_LINK:escapeHtml(reviewLink),
  });
}

export function newTenancyApplicationEmail(name:string,link:string){
 return {subject:'Your new tenancy application',html:renderFinalEmailTemplate('new-tenancy-application.html',{
  FIRST_NAME:escapeHtml(String(name||'').trim().split(/\s+/)[0]||'there'),APPLICATION_LINK:escapeHtml(link),
 })};
}

export function applicationReminderEmail(name: string, link: string) {
 return {subject:'Complete your Fleming Lettings application',html:renderFinalEmailTemplate('13-application-reminder.html',{FIRST_NAME:escapeHtml(name),APPLICATION_LINK:escapeHtml(link)})};
}

export function accountEmail(kind:'invite'|'reset'|'updated',user:{name:string;email:string},link='') {
 return {fromEmail:SECURITY_EMAIL_ADDRESS,subject:kind==='invite'?'Set up your Fleming CRM account':kind==='reset'?'Reset your Fleming CRM password':'Your Fleming CRM password has been updated',html:renderFinalEmailTemplate(`account-${kind}.html`,{NAME:escapeHtml(user.name.split(' ')[0]),EMAIL:escapeHtml(user.email),LINK:escapeHtml(link)})};
}

export function landlordSignatureEmail(name:string,address:string,signingUrl:string,automaticDelivery=true){
 return {subject:'Landlord signature required on a tenancy agreement',html:renderFinalEmailTemplate('landlord-signature.html',{LANDLORD_NAME:escapeHtml(name),PROPERTY_ADDRESS:escapeHtml(address),SIGNING_URL:escapeHtml(signingUrl),DELIVERY_DESCRIPTION:automaticDelivery?'After you sign, the tenant will automatically receive their signing link.':'After you sign, the office will arrange the tenant signing link.'})};
}

export function finalBalanceReceiptEmail(name:string,amount:number,date:string,address:string,remaining=0){
 return {subject:remaining>0?'Payment received towards your final tenancy balance':'Your final tenancy balance has been received',html:renderFinalEmailTemplate('final-balance-receipt.html',{
  FIRST_NAME:escapeHtml(name),AMOUNT:emailMoney(amount),RECEIVED_DATE:escapeHtml(emailDate(date)),
  INTRO_MESSAGE:'We confirm receipt of '+(remaining>0?'a total payment towards your final tenancy balance':'your final tenancy balance')+' for <strong>'+escapeHtml(address)+'</strong>.',
  NEXT_STEPS:remaining>0?'The remaining balance is <strong>£'+emailMoney(remaining)+'</strong>.':'Thank you. The office will confirm the handover arrangements with you.',
 })};
}

export function completedLandlordAgreementEmail(name:string,propertyAddress:string,serviceName:string,signedAt:string){
 const date=new Date(signedAt);if(Number.isNaN(date.getTime()))throw Error('Invalid signing date');
 const day=Number(date.toLocaleString('en-GB',{day:'numeric',timeZone:'Europe/London'})),suffix=day%100>=11&&day%100<=13?'th':(['th','st','nd','rd'][day%10]||'th');
 const fullDate=day+suffix+' '+date.toLocaleString('en-GB',{month:'long',year:'numeric',timeZone:'Europe/London'});
 return {subject:'Your signed agreement - '+normalizePropertyAddress(propertyAddress),html:renderFinalEmailTemplate('landlord-signed-copy.html',{LANDLORD_NAME:escapeHtml(name),PROPERTY_ADDRESS:escapeHtml(normalizePropertyAddress(propertyAddress)),SERVICE_TYPE:escapeHtml(serviceName),DATE_SIGNED:escapeHtml(fullDate)})};
}

export function signatureRequestEmail(name:string,documentName:string,message:string,signingUrl:string){
 const firstName=name.trim().replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i,'').split(/\s+/)[0]||'there';
 return renderFinalEmailTemplate('signature-request.html',{RECIPIENT_NAME:escapeHtml(firstName),DOCUMENT_NAME:escapeHtml(documentName),MESSAGE:escapeHtml(message).replace(/\r?\n/g,'<br>'),SIGNING_URL:escapeHtml(signingUrl)});
}
export function signatureRequestPreview(name:string,documentName:string,message:string){
 const inline=inlineEmailImages(signatureRequestEmail(name,documentName,message,'#preview-only'));
 let html=inline.html;
 for(const asset of inline.attachments)html=html.split('cid:'+asset.contentId).join('data:'+asset.contentType+';base64,'+asset.content.toString('base64'));
  return html;
}

interface GuarantorEmailDetails {
  guarantorName:string;
  tenantNames:string[];
  propertyAddress:string;
}
function guarantorEmailValues(details:GuarantorEmailDetails){
  const names=details.tenantNames.map(name=>name.trim()).filter(Boolean);
  if(!names.length)throw Error('At least one tenant name is required');
  return {
    FIRST_NAME:escapeHtml(details.guarantorName.trim().replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i,'').split(/\s+/)[0]||'there'),
    GUARANTOR_NAME:escapeHtml(details.guarantorName),
    TENANT_NAMES:escapeHtml(names.join(' and ')),
    TENANT_LABEL:names.length===1?'Tenant':'Tenants',
    HAVE_HAS:names.length===1?'has':'have',
    PROPERTY_ADDRESS:escapeHtml(normalizePropertyAddress(details.propertyAddress)),
  };
}
export function guarantorRequestEmail(details:GuarantorEmailDetails&{monthlyRent:number;applicationUrl:string}){
  if(!Number.isFinite(details.monthlyRent)||details.monthlyRent<=0)throw Error('A valid monthly rent is required');
  return {subject:'Your guarantor application and deed of guarantee',html:renderFinalEmailTemplate('guarantor-request.html',{
    ...guarantorEmailValues(details),MONTHLY_RENT:escapeHtml('£'+emailMoney(details.monthlyRent)),APPLICATION_URL:escapeHtml(details.applicationUrl),
  })};
}
export function guarantorWitnessEmail(details:GuarantorEmailDetails&{witnessName:string;applicationUrl:string}){
  return {subject:'Please witness the Deed of Guarantee',html:renderFinalEmailTemplate('guarantor-witness.html',{
    ...guarantorEmailValues(details),FIRST_NAME:escapeHtml(details.witnessName.trim().split(/\s+/)[0]||'there'),APPLICATION_URL:escapeHtml(details.applicationUrl),
  })};
}
export function guarantorCompletedEmail(details:GuarantorEmailDetails&{witnessName:string;tenancyStartDate:string;completedAt:string;guarantorNames?:string[]}){
  const start=new Date(details.tenancyStartDate.slice(0,10)+'T12:00:00Z'),completed=new Date(details.completedAt);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(completed.getTime()))throw Error('Valid tenancy start and completion dates are required');
  const names=(details.guarantorNames||[details.guarantorName]).map(name=>name.trim()).filter(Boolean);
  if(!names.length)throw Error('At least one guarantor name is required');
  const address=addressParts(details.propertyAddress);
  return {subject:'Your completed Deed of Guarantee',html:renderFinalEmailTemplate('guarantor-completed.html',{
    ...guarantorEmailValues(details),PROPERTY_SHORT_ADDRESS:escapeHtml(address.short),PROPERTY_ADDRESS_REMAINDER:escapeHtml(address.remainder),
    TENANCY_START_DATE:emailDate(start),GUARANTOR_LABEL:names.length===1?'Guarantor':'Guarantors',GUARANTOR_NAME:escapeHtml(names.join(' and ')),
    WITNESS_NAME:escapeHtml(details.witnessName),COMPLETED_DATE:escapeHtml(completed.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'})),
  })};
}
export function guarantorChangesEmail(name:string,changes:string,applicationUrl:string){
  return {subject:'Your guarantor application needs an update',html:renderFinalEmailTemplate('guarantor-changes.html',{
    FIRST_NAME:escapeHtml(name.trim().split(/\s+/)[0]||'there'),REQUESTED_CHANGES:escapeHtml(changes).replace(/\r?\n/g,'<br>'),APPLICATION_URL:escapeHtml(applicationUrl),
  })};
}

