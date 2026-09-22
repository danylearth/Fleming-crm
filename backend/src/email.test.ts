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

  it('defaults to the verified mailbox and preserves an explicitly selected campaign sender', async () => {
    let sentPayload: any;
    vi.doMock('resend', () => ({
      Resend: class {
        emails = { send: async (payload: any) => { sentPayload = payload; return { data: { id: 'email-1' }, error: null }; } };
      },
    }));
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.resetModules();
    const { sendEmail } = await import('./email');
    const attachments = [{ filename: 'EPC.pdf', content: Buffer.from('certificate'), contentType: 'application/pdf' }];
    const result = await sendEmail({ to: 'applicant@example.test', subject: 'Test', html: '<p>Test</p>', attachments });
    expect(result.success).toBe(true);
    expect(sentPayload.from).toBe('Fleming Lettings <contact@tenancies.fleminglettings.co.uk>');
    expect(sentPayload.replyTo).toBe('contact@tenancies.fleminglettings.co.uk');
    expect(sentPayload.attachments).toEqual(attachments);
    await sendEmail({to:'applicant@example.test',subject:'Campaign',html:'<p>News</p>',attachments,fromEmail:'enquiries@fleminglettings.co.uk'});
    expect(sentPayload.from).toBe('Fleming Lettings <enquiries@fleminglettings.co.uk>');
    expect(sentPayload.replyTo).toBe('enquiries@fleminglettings.co.uk');
    expect(sentPayload.attachments).toEqual(attachments);
    vi.doUnmock('resend');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the agreed viewing subject and Fleming Lettings signature', async () => {
    const { viewingConfirmationEmail } = await import('./email');
    const email = viewingConfirmationEmail('Alex', '10 High Street, WV1 1AA', '25/08/2026 at 14:00');
    expect(email.subject).toBe('Your viewing at 10 High Street, WV1 1AA');
    expect(email.html).toContain('Lettings Support Team');
    expect(email.html).toContain('enquiries@fleminglettings.co.uk');
    expect(email.html).toContain('company number 13943597');
    expect(email.html).toContain('Google Maps');
    expect(email.html).toContain('Apple Maps');
    expect(email.html).toContain('10%20High%20Street%2C%20WV1%201AA');
  });

  it('does not repeat a postcode already present in a property address', async () => {
    const { normalizePropertyAddress } = await import('./email');
    expect(normalizePropertyAddress('40 Spring Road, Ettingshall, WV4 6LQ', 'WV4 6LQ'))
      .toBe('40 Spring Road, Ettingshall, WV4 6LQ');
    expect(normalizePropertyAddress('76 Goof Street, WV10 8UL','WV10 8UL','Wolverhampton')).toBe('76 Goof Street, Wolverhampton, WV10 8UL');
    expect(normalizePropertyAddress('76 Goof Street, Wolverhampton','WV10 8UL','Wolverhampton')).toBe('76 Goof Street, Wolverhampton, WV10 8UL');
  });

  it('builds the requested changes email with requirements and a secure link', async () => {
    const { applicationChangesRequestedEmail } = await import('./email');
    const email = applicationChangesRequestedEmail('Sam', 'Please upload a clearer passport scan.', 'https://apply.example.test/token');
    expect(email.subject).toBe('More information required for your tenancy application');
    expect(email.html).toContain('What we need to complete your application');
    expect(email.html).toContain('Please upload a clearer passport scan.');
    expect(email.html).toContain('https://apply.example.test/token');
  });

  it('tells applicants that their holding-deposit application can be resumed', async () => {
    const { holdingDepositRequestEmail } = await import('./email');
    const email = holdingDepositRequestEmail('Alex', '10 High Street', 900, 1038, 208, 'https://apply.example.test/token');
    expect(email.html).toContain('save your application and pick up where you left off');
  });

  it('renders and escapes an edited holding-deposit request message', async () => {
    const { holdingDepositRequestEmail } = await import('./email');
    const email = holdingDepositRequestEmail(
      'Alex', '10 High Street', 900, 1038, 208, 'https://apply.example.test/token',
      'Please check <your details>.\nThen continue.',
    );
    expect(email.html).toContain('Please check &lt;your details&gt;.<br>Then continue.');
    expect(email.html).not.toContain('Please check <your details>');
  });

  it('uses the verified mailbox for application confirmations', async () => {
    const { applicationConfirmationEmail, EMAIL_FROM, OUTBOUND_EMAIL_ADDRESS } = await import('./email');
    const email = applicationConfirmationEmail('Alex Smith');
    expect(EMAIL_FROM).toBe('Fleming Lettings <contact@tenancies.fleminglettings.co.uk>');
    expect(OUTBOUND_EMAIL_ADDRESS).toBe('contact@tenancies.fleminglettings.co.uk');
    expect(email.subject).toBe('Thank you for completing your application form');
    expect(email.html).toContain('within the next 48 hours');
    expect(email.html).toContain('additional information or documentation');
    expect(email.html).toContain('Dear Alex,');
    expect(email.html).not.toContain('Dear Alex Smith,');
  });

  it('sends the requested welcome message after an initial enquiry', async () => {
    const { enquiryConfirmationEmail } = await import('./email');
    const email = enquiryConfirmationEmail('Alex and Sam', 'ENQ-42');
    expect(email.subject).toBe('Welcome to Fleming Lettings!');
    expect(email.html).toContain('Hi there Alex and Sam!');
    expect(email.html).toContain('Privacy Policy');
    expect(email.html).toContain('reply to this email');
    expect(email.html).toContain('ENQ-42');
    expect(email.html).toContain('Without any of the hassle');
  });

  it('builds a holding-deposit receipt with the exact subject, amount and date', async () => {
    const { holdingDepositReceiptEmail } = await import('./email');
    const email = holdingDepositReceiptEmail('Alex', 207.69, '2026-09-01');
    expect(email.subject).toBe('Confirmation of receipt of your holding deposit');
    expect(email.html).toContain('£207.69');
    expect(email.html).toContain('1 September 2026');
    expect(email.html).toContain('https://crm.fleminglettings.co.uk/email-assets/relaxing-at-home.png');
  });

  it('renders and escapes an edited holding-deposit receipt message', async () => {
    const { holdingDepositReceiptEmail } = await import('./email');
    const email = holdingDepositReceiptEmail('Alex', 207.69, '2026-09-01', 'Funds received & recorded.');
    expect(email.html).toContain('Funds received &amp; recorded.');
    expect(email.html).not.toContain('Funds received & recorded.');
  });

  it('renders the tenancy agreement invitation with dynamic agreement details', async () => {
    const { tenancyAgreementEmail } = await import('./email');
    const email = tenancyAgreementEmail({
      firstName: 'Alex', propertyAddress: '10 High Street, WV1 1AA', tenancyStartDate: '2026-10-01',
      landlordName: 'Example Landlord', landlordAddress: '1 Landlord Road', monthlyRent: 900,
      securityDeposit: 1038, fundsOnAccount: 207.69, balanceDue: 1730.31,
      signingUrl: 'https://apply.example.test/agreement/secure-token',
    });
    expect(email.subject).toBe('Your tenancy agreement is ready to sign');
    expect(email.html).toContain('Assured Periodic Tenancy');
    expect(email.html).not.toContain('Assured Shorthold Tenancy');
    expect(email.html).toContain('1 October 2026');
    expect(email.html).toContain('&pound;1,730.31');
    expect(email.html).toContain('https://apply.example.test/agreement/secure-token');
    expect(email.html).not.toContain('29 Wealden Hatch');
    expect(email.html).not.toContain('src="assets/');
    expect(email.html).toContain('https://crm.fleminglettings.co.uk/email-assets/signing.png');
  });

  it('renders and escapes the completed agreement email', async () => {
    const { completedTenancyAgreementEmail } = await import('./email');
    const email = completedTenancyAgreementEmail('<Alex>', '10 High Street & Annexe');
    expect(email.subject).toBe('Copy of your completed tenancy agreement');
    expect(email.html).toContain('&lt;Alex&gt;');
    expect(email.html).toContain('10 High Street &amp; Annexe');
    expect(email.html).toContain('completed copy');
    expect(email.html).toContain('Assured Periodic Tenancy');
    expect(email.html).not.toContain('Assured Shorthold Tenancy');
  });

  it('renders the final balance and handover email with payment details', async () => {
    const { finalBalanceHandoverEmail } = await import('./email');
    const email = finalBalanceHandoverEmail({
      firstName: 'Alex', propertyAddress: '10 High Street, WV1 1AA', securityDeposit: 1038,
      monthlyRent: 900, holdingDeposit: 207.69, balanceDue: 1730.31,
      bankDetails: { bankName: 'Example Bank', accountName: 'Example Client Account', sortCode: '20-08-64', accountNumber: '12345678' },
      paymentReference: '10 WV11AA - EXAMPLE',
    });
    expect(email.subject).toBe('Final balance and handover');
    expect(email.html).toContain('&minus;&pound;207.69');
    expect(email.html).toContain('Example Client Account');
    expect(email.html).toContain('10 WV11AA - EXAMPLE');
    expect(email.html).toContain('Reply with your preferred time');
  });

  it('renders the branded handover appointment with dynamic directions', async () => {
    const { handoverAppointmentEmail } = await import('./email');
    const email = handoverAppointmentEmail({
      firstName: 'Sam', propertyAddress: '29 Wealden Hatch, Wolverhampton, WV10 8TY',
      appointmentDate: '2026-10-02', appointmentTime: '15:05', appointmentWith: 'Alex Fleming',
    });
    expect(email.subject).toBe('Your move in and handover date');
    expect(email.html).toContain('Friday 2 October 2026');
    expect(email.html).toContain('3:05pm');
    expect(email.html).toContain('Alex Fleming');
    expect(email.html).toContain('Google Maps');
    expect(email.html).toContain('Apple Maps');
    expect(email.html).not.toContain('src="assets/');
  });
});

it('embeds supplied logo, hero and map images once while retaining PDF attachments separately', async () => {
  const { inlineEmailImages, tenancyEndEmail, handoverAppointmentEmail } = await import('./email');
  const end = tenancyEndEmail('Jamie', '1 Test Street', '2026-11-30');
  expect(end.html).not.toContain('29 Wealden');
  const content = inlineEmailImages(end.html);
  expect(content.html).toContain('cid:fleming-fleming-logo-white.png');
  expect(content.attachments).toHaveLength(2);
  expect(content.attachments.every(a => a.content.length > 100)).toBe(true);
  const move = handoverAppointmentEmail({ firstName: 'Jamie', propertyAddress: '1 Test Street', appointmentDate: '2026-09-14', appointmentTime: '10:00', appointmentWith: 'Staff' });
  const images = inlineEmailImages(move.html);
  expect(images.attachments.some(a => a.filename === 'apple-glyph.png')).toBe(true);
  expect(images.attachments.some(a => a.filename === 'gmaps-pin.png')).toBe(true);
});
