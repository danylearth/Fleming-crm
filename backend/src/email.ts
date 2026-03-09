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
