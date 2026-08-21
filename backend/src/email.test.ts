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
});
