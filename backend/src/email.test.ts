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

  it('uses the agreed viewing subject and Fleming Lettings signature', async () => {
    const { viewingConfirmationEmail } = await import('./email');
    const email = viewingConfirmationEmail('Alex', '10 High Street, WV1 1AA', '25/08/2026 at 14:00');
    expect(email.subject).toBe('Your viewing with Fleming Lettings at 10 High Street, WV1 1AA');
    expect(email.html).toContain('Lettings Support Team | fleminglettings.co.uk');
    expect(email.html).toContain('enquiries@fleminglettings.co.uk');
  });

  it('tells applicants that their holding-deposit application can be resumed', async () => {
    const { holdingDepositRequestEmail } = await import('./email');
    const email = holdingDepositRequestEmail('Alex', '10 High Street', 900, 1038, 208, 'https://apply.example.test/token');
    expect(email.html).toContain('save your application and pick up where you left off');
  });
});
