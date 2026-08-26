import { describe, it, expect, vi } from 'vitest';

describe('email provider safety', () => {
  it('does not report a successful send when Resend is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('ALLOW_SIMULATED_MESSAGES', '');
    vi.resetModules();
    const { sendEmail } = await import('./email');
    const result = await sendEmail({
      to: 'applicant@example.test',
      subject: 'Test message',
      html: '<p>Test</p>',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
    vi.unstubAllEnvs();
  });

  it('forces every provider send to use and reply to the verified mailbox', async () => {
    let sentPayload: any;
    vi.doMock('resend', () => ({
      Resend: class {
        emails = { send: async (payload: any) => { sentPayload = payload; return { data: { id: 'email-1' }, error: null }; } };
      },
    }));
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.resetModules();
    const { sendEmail } = await import('./email');
    const result = await sendEmail({ to: 'applicant@example.test', subject: 'Test', html: '<p>Test</p>' });
    expect(result.success).toBe(true);
    expect(sentPayload.from).toBe('Fleming Lettings <contact@tenancies.fleminglettings.co.uk>');
    expect(sentPayload.replyTo).toBe('contact@tenancies.fleminglettings.co.uk');
    vi.doUnmock('resend');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the agreed viewing subject and Fleming Lettings signature', async () => {
    const { viewingConfirmationEmail } = await import('./email');
    const email = viewingConfirmationEmail('Alex', '10 High Street, WV1 1AA', '25/08/2026 at 14:00');
    expect(email.subject).toBe('Your viewing with Fleming Lettings at 10 High Street, WV1 1AA');
    expect(email.html).toContain('Lettings Support Team | fleminglettings.co.uk');
    expect(email.html).toContain('contact@tenancies.fleminglettings.co.uk');
  });

  it('tells applicants that their holding-deposit application can be resumed', async () => {
    const { holdingDepositRequestEmail } = await import('./email');
    const email = holdingDepositRequestEmail('Alex', '10 High Street', 900, 1038, 208, 'https://apply.example.test/token');
    expect(email.html).toContain('save your application and pick up where you left off');
  });

  it('uses the verified mailbox for application confirmations', async () => {
    const { applicationConfirmationEmail, EMAIL_FROM, OUTBOUND_EMAIL_ADDRESS } = await import('./email');
    const email = applicationConfirmationEmail('Alex Smith');
    expect(EMAIL_FROM).toBe('Fleming Lettings <contact@tenancies.fleminglettings.co.uk>');
    expect(OUTBOUND_EMAIL_ADDRESS).toBe('contact@tenancies.fleminglettings.co.uk');
    expect(email.subject).toBe('Thank you for completing your application form');
    expect(email.html).toContain('within the next 48 hours');
    expect(email.html).toContain('additional information or documentation');
  });

  it('sends the requested welcome message after an initial enquiry', async () => {
    const { enquiryConfirmationEmail } = await import('./email');
    const email = enquiryConfirmationEmail('Alex and Sam', 'ENQ-42');
    expect(email.subject).toBe('Welcome to Fleming Lettings!');
    expect(email.html).toContain('Hi there Alex and Sam!');
    expect(email.html).toContain('Privacy Policy');
    expect(email.html).toContain('reply to this email');
  });
});
