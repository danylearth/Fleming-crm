import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const provider=vi.hoisted(()=>({send:vi.fn(),preferences:vi.fn()}));
vi.mock('resend',()=>({Resend:class{emails={send:provider.send}}}));
vi.mock('./email-preferences',()=>({emailPreferencesUrl:provider.preferences}));
beforeEach(()=>{vi.stubEnv('RESEND_API_KEY','test-only');vi.stubEnv('ALLOW_SIMULATED_MESSAGES','false');vi.resetModules();provider.send.mockReset().mockResolvedValue({data:{id:'test-email'},error:null});provider.preferences.mockClear();});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it('delivers a transactional single-use code with a 20-minute expiry to the selected account email',async()=>{
  const {sendLoginVerificationEmail}=await import('./email');
  expect(await sendLoginVerificationEmail('staff@example.test','123456','Sam Fleming')).toBe(true);
  const message=provider.send.mock.calls[0][0];
  expect(message.to).toBe('staff@example.test');
  expect(message.from).toBe('Fleming Lettings <no-reply@fleminglettings.co.uk>');
  expect(message.subject).not.toContain('123456');
  expect(message.html).toContain('123456');
  expect(message.html).toContain('20 minutes');
  expect(message.html).toContain('only be used once');
  expect(message.html).toContain('Hi Sam,');
  expect(message.html).not.toContain('SIGNINCODE');
  expect(message.html).not.toContain('UNSUBSCRIBE_LINK');
  expect(message.attachments).toHaveLength(7);
  expect(provider.preferences).not.toHaveBeenCalled();
});
it.each(['invite','reset','updated'] as const)('sends %s account mail from the security mailbox',async(kind)=>{
  provider.preferences.mockResolvedValue('https://example.test/preferences');
  const {accountEmail,sendEmail}=await import('./email');
  const content=accountEmail(kind,{name:'Alex Example',email:'alex@example.test'},'https://example.test/account');
  expect((await sendEmail({to:'alex@example.test',...content})).success).toBe(true);
  expect(provider.send.mock.calls[0][0].from).toBe('Fleming Lettings <no-reply@fleminglettings.co.uk>');
});
it('fails closed on provider rejection without logging the code',async()=>{
  provider.send.mockRejectedValue(new Error('private code 123456'));
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(await (await import('./email')).sendLoginVerificationEmail('staff@example.test','123456')).toBe(false);
  expect(JSON.stringify(log.mock.calls)).not.toContain('123456');
});
it('never simulates a security email',async()=>{
  vi.stubEnv('ALLOW_SIMULATED_MESSAGES','true');
  expect(await (await import('./email')).sendLoginVerificationEmail('staff@example.test','123456')).toBe(false);
  expect(provider.send).not.toHaveBeenCalled();
});
