import {afterEach,describe,expect,it,vi} from 'vitest';
import twilio from 'twilio';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.resetModules();});
async function sender(){
  vi.stubEnv('TWILIO_ACCOUNT_SID','AC'+'0'.repeat(32));
  vi.stubEnv('TWILIO_AUTH_TOKEN','test-token');
  vi.stubEnv('TWILIO_PHONE_NUMBER','+447700900001');
  vi.stubEnv('TWILIO_SENDER_ID','Fleming');
  vi.stubEnv('ALLOW_SIMULATED_MESSAGES','false');
  vi.resetModules();
  return (await import('./sms')).sendSecurityCode;
}
describe('security code delivery',()=>{
  it('uses a voice call with a numeric caller ID for the office landline',async()=>{
    const request=vi.spyOn(twilio.Twilio.prototype,'request').mockResolvedValue({body:{sid:'CA-test'},statusCode:201,headers:{}} as any);
    const send=await sender();
    expect(await send('+441902212331','123456','sign in on a new device')).toBe(true);
    const opts=request.mock.calls[0][0];
    expect(opts.uri).toContain('/Calls.json');
    expect(opts.data.From).toBe('+447700900001');
    expect(opts.data.Twiml).toContain('1 2 3 4 5 6');
  });
  it('explains Twilio voice suspension without leaking secrets or falling back to another recipient',async()=>{
    const request=vi.spyOn(twilio.Twilio.prototype,'request').mockRejectedValue(Object.assign(new Error('Secret code 123456 for +441902212331'),{code:10005,status:403}));
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    const send=await sender();
    await expect(send('+441902212331','123456','sign in')).rejects.toThrow('Verification calls are currently blocked');
    expect(request).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/123456|441902212331/);
    expect(log).toHaveBeenCalledWith('[2FA] Verification delivery failed',{channel:'voice',code:10005,status:403});
  });
  it('continues to send SMS to a trusted mobile',async()=>{
    const request=vi.spyOn(twilio.Twilio.prototype,'request').mockResolvedValue({body:{sid:'SM-test'},statusCode:201,headers:{}} as any);
    const send=await sender();
    expect(await send('+447700900000','123456','sign in','Sam Fleming')).toBe(true);
    expect(request.mock.calls[0][0].uri).toContain('/Messages.json');
    expect(request.mock.calls[0][0].data.Body).toBe('Hi Sam, your two-factor authentication code is 123456. This code will expire in 20 minutes. If you were not expecting this message then please contact your line manager or the administrator urgently.');
  });
  it('does not accept a failed SMS as verification delivery',async()=>{
    vi.spyOn(twilio.Twilio.prototype,'request').mockRejectedValue({code:21608,status:400});
    vi.spyOn(console,'error').mockImplementation(()=>{});
    expect(await (await sender())('+447700900000','123456','sign in')).toBe(false);
  });
});
