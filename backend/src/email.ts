import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export const OUTBOUND_EMAIL_ADDRESS = 'contact@tenancies.fleminglettings.co.uk';
export const EMAIL_FROM = `Fleming Lettings <${OUTBOUND_EMAIL_ADDRESS}>`;
const ALLOW_SIMULATED_MESSAGES = process.env.ALLOW_SIMULATED_MESSAGES === 'true' && process.env.NODE_ENV !== 'production';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

function emailSignature(): string {
  return `
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #eee;color:#555;font-size:13px;line-height:1.6">
      <strong style="color:#25073B">Lettings Support Team | fleminglettings.co.uk</strong><br/>
      <a href="mailto:${OUTBOUND_EMAIL_ADDRESS}" style="color:#DC006D;text-decoration:none">${OUTBOUND_EMAIL_ADDRESS}</a> | 01902 212 415
    </div>
    <div style="margin-top:18px;background:linear-gradient(135deg,#25073B,#DC006D);padding:20px;text-align:center;color:#fff;border-radius:8px">
      <strong style="font-size:17px">All of your property needs</strong><br/>
      <span style="font-size:14px">Without any of the hassle</span>
    </div>`;
}

function emailDisclaimer(): string {
  return `
    <div style="background:#f5f5f5;padding:16px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
      <p style="font-size:10px;color:#888;line-height:1.5;margin:0">
        This email and any attachments are confidential and intended only for the named recipient. If you received it in error, please delete it and notify us. Fleming Lettings and Developments UK Limited, company number 13943597. Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG.
      </p>
    </div>`;
}

export function brandedEmailHtml(title: string, content: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
      <div style="background:linear-gradient(135deg,#25073B,#DC006D);padding:30px;border-radius:12px 12px 0 0;text-align:center">
        <div style="color:#fff;font-size:24px;font-weight:700">Fleming Lettings</div>
        <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:5px">${title}</div>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #eee;border-top:none;font-size:14px;line-height:1.65">
        ${content}
        ${emailSignature()}
      </div>
      ${emailDisclaimer()}
    </div>`;
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
    subject: 'Changes required for your Fleming Lettings application',
    html: brandedEmailHtml('Application Review', `
      <p>Hi ${name || 'there'},</p>
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
  return {
    subject: `Your viewing with Fleming Lettings at ${cleanAddress}`,
    html: brandedEmailHtml('Viewing Confirmation', `
        <p>Hi ${name},</p>
        <p>This is to confirm your viewing at:</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>${cleanAddress}</strong><br/>
          <span style="color: #666;">Date: ${date}</span>
        </div>
        <p>Please arrive on time. If you need to reschedule, reply to this email or call us.</p>
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
  return {
    subject: `Holding Deposit Request - ${address}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #25073B, #DC006D); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 22px;">Fleming Lettings</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">Holding Deposit Request</p>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #eee; border-top: none;">
          <p style="font-size: 15px; color: #333;">Dear ${name},</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Thank you for your interest in <strong>${address}</strong>. We are pleased to confirm that we would like to proceed with your application.
          </p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            To secure this property, we require an initial holding deposit. Please see the financial summary below:
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f8f8f8;">
              <td style="padding: 12px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Monthly Rent</td>
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">&pound;${monthlyRent.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 12px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Security Deposit</td>
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">&pound;${securityDeposit.toLocaleString()}</td>
            </tr>
            <tr style="background: #f0f8ff;">
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #DC006D; border-bottom: 2px solid #DC006D;">Holding Deposit (due now)</td>
              <td style="padding: 12px 16px; font-size: 16px; font-weight: 700; color: #DC006D; text-align: right; border-bottom: 2px solid #DC006D;">&pound;${holdingDeposit.toLocaleString()}</td>
            </tr>
          </table>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Please complete your application and review the holding deposit terms by clicking the button below:
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${applicationFormUrl}" style="display: inline-block; background: linear-gradient(135deg, #DC006D, #a5004f); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
              Complete Application &amp; Review Terms
            </a>
          </div>
          <p style="font-size: 13px; color: #888; line-height: 1.6;">
            Please review the holding deposit information and financial summary above carefully before making any payment.
          </p>
          <p style="font-size: 13px; color: #555; line-height: 1.6;">
            Struggling to do it all at once? You can save your application and pick up where you left off at any time by opening this link again.
          </p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            If you have any questions, please don't hesitate to contact us.
          </p>
          <p style="font-size: 14px; color: #555;">
            Kind regards,<br/><strong>Lettings Support Team | fleminglettings.co.uk</strong><br/>
            <span style="font-size: 12px; color: #888;">01902 212 415 | contact@tenancies.fleminglettings.co.uk</span>
          </p>
        </div>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 0 0 12px 12px; text-align: center; border: 1px solid #eee; border-top: none;">
          <p style="font-size: 11px; color: #999; margin: 0;">
            Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG
          </p>
        </div>
      </div>
    `,
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
    html: brandedEmailHtml('Enquiry Received', `
          <p style="font-size: 15px; color: #333;">Hi there ${name}!</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Thank you for registering with Fleming Lettings. We have received your application${propertyAddress ? ` regarding <strong>${propertyAddress}</strong>` : ''} and our lettings team will review it in due course.
          </p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <span style="font-size: 13px; color: #666;">Your reference:</span>
            <strong style="font-size: 15px; color: #333;"> ${reference}</strong>
          </div>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            We retain your information in line with our <a href="https://fleminglettings.co.uk/privacy-policy" style="color: #DC006D;">Privacy Policy</a> to support your property application and help find other suitable properties. You can ask us to remove your information at any time, subject to our legal obligations.
          </p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            If you have any questions, reply to this email or call us on <strong>01902 212 415</strong> quoting your reference.
          </p>
      `),
  };
}

export function applicationConfirmationEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Thank you for completing your application form',
    html: brandedEmailHtml('Application Received', `
          <p style="font-size: 15px; color: #333;">Dear ${name},</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">Thank you for completing your application form.</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">Our office team will review your application and be in touch with you within the next 48 hours.</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">Please note that we may still require additional information or documentation from you to complete our checks. If so, a member of our team will contact you.</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">If you have any questions, reply to this email or call us on <strong>01902 212 415</strong>.</p>
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
