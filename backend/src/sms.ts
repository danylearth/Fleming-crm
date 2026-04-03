// Twilio SMS integration — follows same pattern as email.ts
// If TWILIO env vars are missing, simulates sends (console.log + fake SID)

import type { Request, Response, NextFunction } from 'express';

let twilioClient: any = null;
let twilioLib: any = null;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

if (process.env.TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  try {
    twilioLib = require('twilio');
    twilioClient = twilioLib(process.env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.warn('[SMS] Twilio package not installed — SMS will be simulated');
  }
}

/**
 * Express middleware to validate Twilio webhook signatures.
 * Skips validation when TWILIO_AUTH_TOKEN or BASE_URL is not configured (dev/simulation mode).
 * In production, rejects requests with missing or invalid X-Twilio-Signature headers.
 */
export function validateTwilioWebhook(req: Request, res: Response, next: NextFunction) {
  if (!TWILIO_AUTH_TOKEN || !process.env.BASE_URL || !twilioLib) {
    // No auth token or base URL = simulation/dev mode, skip validation
    return next();
  }

  const signature = req.headers['x-twilio-signature'] as string;
  if (!signature) {
    console.warn('[TWILIO] Missing X-Twilio-Signature header');
    return res.status(403).send('Missing Twilio signature');
  }

  const url = `${process.env.BASE_URL}${req.originalUrl}`;
  const isValid = twilioLib.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body);

  if (!isValid) {
    console.warn('[TWILIO] Invalid webhook signature');
    return res.status(403).send('Invalid signature');
  }

  next();
}

export interface SendSmsParams {
  to: string;
  body: string;
}

export async function sendSms(params: SendSmsParams): Promise<{ success: boolean; sid?: string; error?: string }> {
  if (!twilioClient) {
    console.log('[SMS SIMULATED]', { to: params.to, body: params.body.substring(0, 80) + '...' });
    return { success: true, sid: 'simulated-' + Date.now() };
  }

  try {
    const createOpts: Record<string, string> = {
      body: params.body,
      from: TWILIO_PHONE,
      to: params.to,
    };
    // Only set statusCallback when BASE_URL is configured (Twilio can't reach localhost)
    if (process.env.BASE_URL) {
      createOpts.statusCallback = `${process.env.BASE_URL}/api/sms/status`;
    }
    const message = await twilioClient.messages.create(createOpts);
    console.log('[SMS SENT]', { to: params.to, sid: message.sid });
    return { success: true, sid: message.sid };
  } catch (err: any) {
    console.error('[SMS ERROR]', err);
    return { success: false, error: err.message || 'Failed to send SMS' };
  }
}

// Normalize UK phone numbers to E.164 format (+44...)
export function normalizeUkPhone(phone: string): string {
  if (!phone) return phone;
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  // Handle UK numbers
  if (digits.startsWith('44')) {
    return '+' + digits;
  }
  if (digits.startsWith('0')) {
    return '+44' + digits.substring(1);
  }
  // If already has country code or is international
  if (digits.length >= 11) {
    return '+' + digits;
  }
  // Fallback: assume UK
  return '+44' + digits;
}

// SMS Templates

export function viewingConfirmationSms(name: string, address: string, date: string, time: string): string {
  return `Hi ${name}, your property viewing at ${address} has been confirmed for ${date}${time ? ' at ' + time : ''}. Please arrive on time. If you need to reschedule, please call us. - Fleming Lettings`;
}

export function followUpSms(name: string): string {
  return `Hi ${name}, just following up on your property enquiry with Fleming Lettings. Are you still looking? Please let us know if you'd like to arrange a viewing or have any questions. Call us on 01902 212 415. - Fleming Lettings`;
}

export function rejectionSms(name: string, reason?: string): string {
  const base = `Hi ${name}, thank you for your enquiry with Fleming Lettings. Unfortunately, we are unable to proceed with your application at this time.`;
  const reasonLine = reason ? ` Reason: ${reason}.` : '';
  return `${base}${reasonLine} We wish you the best in your property search. - Fleming Lettings`;
}

export function rentReminderSms(name: string, amount: string, dueDate: string): string {
  return `Hi ${name}, this is a reminder that your rent payment of £${amount} is due on ${dueDate}. Please ensure payment is made on time. If you have already paid, please disregard this message. - Fleming Lettings`;
}

export function genericSms(name: string, message: string): string {
  return `Hi ${name}, ${message} - Fleming Lettings`;
}
