import { describe, it, expect, vi } from 'vitest';
import { normalizeUkPhone, viewingConfirmationSms, followUpSms, rejectionSms, rentReminderSms, genericSms } from './sms';

describe('normalizeUkPhone', () => {
  it('returns empty string unchanged', () => {
    expect(normalizeUkPhone('')).toBe('');
  });

  it('converts 07xxx to +447xxx', () => {
    expect(normalizeUkPhone('07912345678')).toBe('+447912345678');
  });

  it('preserves numbers already starting with 44', () => {
    expect(normalizeUkPhone('447912345678')).toBe('+447912345678');
  });

  it('strips non-digit characters', () => {
    expect(normalizeUkPhone('079 1234 5678')).toBe('+447912345678');
    expect(normalizeUkPhone('+44 (0)7912 345 678')).toBe('+4407912345678');
    // Note: the function strips non-digits first, so +44(0)... becomes 4407912345678
    // which starts with 44 so becomes +4407912345678
  });

  it('handles numbers with dashes', () => {
    expect(normalizeUkPhone('079-1234-5678')).toBe('+447912345678');
  });

  it('handles international numbers with 11+ digits', () => {
    expect(normalizeUkPhone('1234567890123')).toBe('+1234567890123');
  });

  it('assumes UK for short numbers without prefix', () => {
    expect(normalizeUkPhone('7912345678')).toBe('+447912345678');
  });
});

describe('SMS templates', () => {
  it('viewingConfirmationSms includes name, address, date', () => {
    const msg = viewingConfirmationSms('John', '123 Main St', '2026-04-10', '14:00');
    expect(msg).toContain('John');
    expect(msg).toContain('123 Main St');
    expect(msg).toContain('2026-04-10');
    expect(msg).toContain('14:00');
    expect(msg).toContain('Fleming Lettings');
  });

  it('viewingConfirmationSms omits time clause when empty', () => {
    const msg = viewingConfirmationSms('Jane', '456 High St', '2026-04-10', '');
    // When time is empty, the template should not append " at <time>"
    expect(msg).toContain('confirmed for 2026-04-10.');
    expect(msg).not.toContain('confirmed for 2026-04-10 at');
  });

  it('followUpSms includes name', () => {
    const msg = followUpSms('Alice');
    expect(msg).toContain('Alice');
    expect(msg).toContain('Fleming Lettings');
  });

  it('rejectionSms uses the agreed applicant wording', () => {
    const msg = rejectionSms('Bob');
    expect(msg).toContain('Bob');
    expect(msg).toContain('continue to search for similar properties');
    expect(msg).toContain('All the very best in your search!');
  });

  it('rentReminderSms includes amount and due date', () => {
    const msg = rentReminderSms('Charlie', '850', '2026-04-01');
    expect(msg).toContain('Charlie');
    expect(msg).toContain('850');
    expect(msg).toContain('2026-04-01');
  });

  it('genericSms wraps message with name and sign-off', () => {
    const msg = genericSms('Dan', 'your keys are ready for collection');
    expect(msg).toBe('Hi Dan, your keys are ready for collection - Fleming Lettings');
  });
});

describe('SMS provider safety', () => {
  it('prefers the branded sender ID when configured', async () => {
    vi.stubEnv('TWILIO_SENDER_ID', 'FlemingLets');
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+441902212415');
    vi.resetModules();
    const { SMS_FROM } = await import('./sms');
    expect(SMS_FROM).toBe('FlemingLets');
    vi.unstubAllEnvs();
  });

  it('falls back to the Twilio phone number without a branded sender ID', async () => {
    vi.stubEnv('TWILIO_SENDER_ID', '');
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+441902212415');
    vi.resetModules();
    const { SMS_FROM } = await import('./sms');
    expect(SMS_FROM).toBe('+441902212415');
    vi.unstubAllEnvs();
  });

  it('does not report a successful send when Twilio is not configured', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', '');
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    vi.stubEnv('TWILIO_PHONE_NUMBER', '');
    vi.stubEnv('ALLOW_SIMULATED_MESSAGES', '');
    vi.resetModules();
    const { sendSms } = await import('./sms');
    const result = await sendSms({ to: '+447700900000', body: 'Test message' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
    vi.unstubAllEnvs();
  });
});
