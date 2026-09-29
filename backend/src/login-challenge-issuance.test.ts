import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({queries:[] as any[],count:0,sent:0,locked:false,latest:null as Date|null,email:vi.fn(),phone:vi.fn()}));
vi.mock('./db-pg',()=>({queryOne:vi.fn(),default:{connect:async()=>({release(){},query:async(sql:string,values:any[])=>{
  state.queries.push({sql,values});
  if(sql.startsWith('SELECT trusted_phone'))return {rows:[{id:3,trusted_phone:'+441902212331',email:'saved@example.test',name:'Sam Fleming',login_2fa_sent_count:state.sent,login_locked_at:state.locked?new Date():null}]};
  if(sql.startsWith('UPDATE users SET login_2fa_sent_count'))return {rows:[{login_2fa_lock_after:values[1]>=3?new Date(Date.now()+300000):null}]};
  if(sql.startsWith('SELECT COUNT'))return {rows:[{count:state.count,latest:state.latest}]};
  return {rows:[]};
}})}}));
vi.mock('./email',()=>({sendLoginVerificationEmail:state.email}));
vi.mock('./sms',()=>({sendSecurityCode:state.phone,normalizeUkPhone:(v:string)=>v}));
import {issuePhoneChallenge} from './settings-phone-verification';
beforeEach(()=>{vi.useRealTimers();process.env.JWT_SECRET='test-only-secret';process.env.ALLOW_SIMULATED_MESSAGES='false';state.queries=[];state.count=0;state.sent=0;state.locked=false;state.latest=null;state.email.mockReset().mockResolvedValue(true);state.phone.mockReset().mockResolvedValue(true);});
const req:any={user:{id:3},headers:{'user-agent':'test'},body:{emailDestination:'attacker@example.test'}};
it('uses only the database email and stores hashes with an expiry exactly 1200 seconds from creation',async()=>{
  const result=await issuePhoneChallenge(req,'login',{email:'saved@example.test'},undefined,'email');
  expect(state.email).toHaveBeenCalledWith('saved@example.test',expect.stringMatching(/^\d{6}$/),'Sam Fleming');
  expect(state.phone).not.toHaveBeenCalled();
  expect(result).toMatchObject({expiresInSeconds:1200,methods:['email'],destinations:['saved@example.test']});
  const insert=state.queries.find(q=>q.sql.startsWith('INSERT INTO settings_phone_challenges'));
  expect(insert.sql).toContain("NOW()+($8::int * INTERVAL '1 second')");
  expect(insert.values[7]).toBe(1200);expect(insert.values[8]).toBe('email');
  expect(insert.values[6]).not.toContain(state.email.mock.calls[0][1]);
});
it('preserves voice delivery to the existing trusted landline with the same 20-minute expiry',async()=>{
  const result=await issuePhoneChallenge(req,'login',{},undefined,'phone');
  expect(state.phone).toHaveBeenCalledWith('+441902212331',expect.any(String),'sign in on a new device','Sam Fleming');
  expect(state.email).not.toHaveBeenCalled();expect(result.expiresInSeconds).toBe(1200);expect(result.methods).toEqual(['voice call']);
});
it('does not allow email to approve sensitive settings changes',async()=>{
  await expect(issuePhoneChallenge(req,'company-settings',{},undefined,'email')).rejects.toThrow('not available');
  expect(state.email).not.toHaveBeenCalled();
});
it('shares the existing delivery rate limit across email and phone',async()=>{
  state.count=3;await expect(issuePhoneChallenge(req,'login',{},undefined,'email')).rejects.toThrow('Maximum three');expect(state.email).not.toHaveBeenCalled();
});
it('rolls back a failed send and never returns a delivered challenge',async()=>{
  state.email.mockResolvedValue(false);await expect(issuePhoneChallenge(req,'login',{},undefined,'email')).rejects.toThrow('Unable to deliver');
  expect(state.queries.at(-1).sql).toBe('ROLLBACK');
});
it.each(['phone','email'] as const)('blocks %s requests before five minutes without invalidating the previous code',async(method)=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-28T17:00:00Z'));state.count=1;state.latest=new Date(Date.now()-299999);
  await expect(issuePhoneChallenge(req,'login',{},undefined,method)).rejects.toThrow('five minutes');
  expect(state.email).not.toHaveBeenCalled();expect(state.phone).not.toHaveBeenCalled();
  expect(state.queries.some(q=>q.sql.startsWith('UPDATE settings_phone_challenges'))).toBe(false);
  vi.useRealTimers();
});
it.each(['phone','email'] as const)('allows %s requests at exactly five minutes and starts a fresh cooldown',async(method)=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-28T17:00:00Z'));state.count=1;state.latest=new Date(Date.now()-300000);
  const result=await issuePhoneChallenge(req,'login',{},undefined,method);
  expect(result).toMatchObject({resendAfterSeconds:300,expiresInSeconds:1200});
  expect(state.queries.some(q=>q.sql.startsWith('UPDATE settings_phone_challenges'))).toBe(true);
  vi.useRealTimers();
});
it('returns the third-code deadline and refuses a fourth code without sending',async()=>{
 state.sent=2;const result=await issuePhoneChallenge(req,'login',{},undefined,'email');
 expect(result).toMatchObject({codesSent:3});expect(result.lockAt).toBeTruthy();
 state.sent=3;state.email.mockClear();await expect(issuePhoneChallenge(req,'login',{},undefined,'email')).rejects.toThrow('Three codes have been sent');expect(state.email).not.toHaveBeenCalled();
});
it('refuses all delivery when the account is locked',async()=>{
 state.locked=true;await expect(issuePhoneChallenge(req,'login',{},undefined,'email')).rejects.toThrow('account is locked');expect(state.email).not.toHaveBeenCalled();
});
it('does not count a provider rejection as a sent code',async()=>{
 state.email.mockResolvedValue(false);await expect(issuePhoneChallenge(req,'login',{},undefined,'email')).rejects.toThrow('Unable to deliver');expect(state.queries.some(q=>q.sql.startsWith('UPDATE users SET login_2fa_sent_count'))).toBe(false);
});
