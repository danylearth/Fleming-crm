// Twilio SMS integration — follows same pattern as email.ts
// If TWILIO env vars are missing, simulates sends (console.log + fake SID)

let twilioClient: any = null;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER || '';

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.warn('[SMS] Twilio package not installed — SMS will be simulated');
  }
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

export function genericSms(name: string, message: string): string {
  return `Hi ${name}, ${message} - Fleming Lettings`;
}
