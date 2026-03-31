import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Fleming Lettings <onboarding@resend.dev>';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!resend) {
    console.log('[EMAIL SIMULATED]', { to: params.to, subject: params.subject });
    return { success: true, id: 'simulated-' + Date.now() };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: params.from || EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
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
  return {
    subject: `Viewing Confirmation - ${address}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Viewing Confirmation</h2>
        <p>Hi ${name},</p>
        <p>This is to confirm your viewing at:</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>${address}</strong><br/>
          <span style="color: #666;">Date: ${date}</span>
        </div>
        <p>Please arrive on time. If you need to reschedule, reply to this email or call us.</p>
        <p>Best regards,<br/>Fleming Lettings</p>
      </div>
    `,
  };
}

export function referenceChaseEmail(landlordName: string, tenantName: string, propertyAddress: string): { subject: string; html: string } {
  return {
    subject: `Reference Request - ${tenantName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Landlord Reference Request</h2>
        <p>Dear ${landlordName},</p>
        <p>We are writing regarding a reference request for <strong>${tenantName}</strong>, who has applied for a property at <strong>${propertyAddress}</strong>.</p>
        <p>We would greatly appreciate it if you could provide a landlord reference at your earliest convenience. We kindly request a response within <strong>48 hours</strong>.</p>
        <p>If you have any questions, please don't hesitate to get in touch.</p>
        <p>Kind regards,<br/>Fleming Lettings</p>
      </div>
    `,
  };
}

export function rentReminderEmail(tenantName: string, amount: number, address: string, dueDate: string): { subject: string; html: string } {
  return {
    subject: `Rent Payment Reminder - ${address}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Rent Payment Reminder</h2>
        <p>Dear ${tenantName},</p>
        <p>This is a friendly reminder that your rent payment is outstanding:</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>Property:</strong> ${address}<br/>
          <strong>Amount Due:</strong> &pound;${amount.toLocaleString()}<br/>
          <strong>Due Date:</strong> ${dueDate}
        </div>
        <p>If you have already made this payment, please disregard this message. Otherwise, please arrange payment as soon as possible.</p>
        <p>If you are experiencing difficulties, please contact us to discuss your options.</p>
        <p>Kind regards,<br/>Fleming Lettings</p>
      </div>
    `,
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
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Application Update</h2>
        <p>Hi ${name},</p>
        <p>We wanted to let you know that regarding your application for <strong>${address}</strong>, ${statusMessages[status] || 'your application status has been updated'}.</p>
        <p>If you have any questions, please don't hesitate to get in touch.</p>
        <p>Best regards,<br/>Fleming Lettings</p>
      </div>
    `,
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
            The Holding Deposit Information Sheet is attached to this email for your records. Please read it carefully before making any payment.
          </p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            If you have any questions, please don't hesitate to contact our accounts team.
          </p>
          <p style="font-size: 14px; color: #555;">
            Kind regards,<br/><strong>Fleming Lettings</strong><br/>
            <span style="font-size: 12px; color: #888;">01902 212 415 | accounts@fleminglettings.co.uk</span>
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

export function genericEmail(name: string, topic: string): { subject: string; html: string } {
  return {
    subject: topic,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${topic}</h2>
        <p>Hi ${name},</p>
        <p>Thank you for your enquiry. We wanted to follow up regarding ${topic.toLowerCase()}.</p>
        <p>Please don't hesitate to get in touch if you have any questions.</p>
        <p>Best regards,<br/>Fleming Lettings</p>
      </div>
    `,
  };
}
