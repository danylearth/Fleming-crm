import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({user:null as any,queries:[] as {sql:string,args:any[]}[],passwordValid:false}));
vi.mock('bcryptjs',()=>({default:{compare:async()=>state.passwordValid}}));
const client={release(){},query:async(sql:string,args:any[]=[])=>{
 state.queries.push({sql,args});
 if(sql.startsWith('SELECT * FROM users'))return {rows:state.user?[{...state.user}]:[]};
 if(sql.startsWith('UPDATE users SET login_password_failures=$2'))state.user.login_password_failures=args[1];
 if(sql.startsWith('UPDATE users SET login_password_failures=0'))state.user.login_password_failures=0;
 if(sql.startsWith('UPDATE users SET login_2fa_failures=$2'))state.user.login_2fa_failures=args[1];
 if(sql.startsWith('UPDATE users SET login_2fa_sent_count=$2')){
  state.user.login_2fa_sent_count=args[1];state.user.login_2fa_lock_after=args[1]>=3?new Date(Date.now()+300000):null;
  return {rows:[{login_2fa_lock_after:state.user.login_2fa_lock_after}]};
 }
 if(sql.startsWith('UPDATE users SET login_locked_at=NOW()'))state.user.login_locked_at=new Date();
 return {rows:[]};
}};
vi.mock('./db-pg',()=>({default:{connect:async()=>client}}));
import {checkLoginPassword,loginCodeFailed,loginCodeSent,loginIsLocked,loginOpen,resetLoginFailures} from './login-security';
beforeEach(()=>{state.user={id:9,email:'staff@example.test',password:'hash',login_password_failures:0,login_2fa_failures:0,login_2fa_sent_count:0};state.queries=[];state.passwordValid=false;vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-28T17:00:00Z'));});
afterEach(()=>vi.useRealTimers());
it('prompts password reset on the third incorrect password and persists the count',async()=>{
 for(let i=1;i<=3;i++){const result=await checkLoginPassword('staff@example.test','wrong');expect(result.status).toBe(401);expect(result.requiresPasswordReset).toBe(i===3);expect(state.user.login_password_failures).toBe(i);expect(result.user).toBeUndefined();}
 expect(state.queries.at(-1)?.sql).toBe('COMMIT');
});
it('a correct password clears password failures without clearing pending two-factor counts',async()=>{
 state.user.login_password_failures=2;state.user.login_2fa_sent_count=2;state.passwordValid=true;
 expect((await checkLoginPassword('staff@example.test','correct')).user?.id).toBe(9);
 expect(state.user.login_password_failures).toBe(0);expect(state.user.login_2fa_sent_count).toBe(2);
});
it('the third sent code starts a five-minute deadline, enforced at the exact boundary',async()=>{
 expect((await loginCodeSent(client as any,state.user)).lockAt).toBeNull();
 expect((await loginCodeSent(client as any,state.user)).lockAt).toBeNull();
 expect(await loginCodeSent(client as any,state.user)).toEqual({codesSent:3,lockAt:'2026-09-28T17:05:00.000Z'});
 vi.setSystemTime(new Date('2026-09-28T17:04:59.999Z'));expect(await loginOpen(client as any,state.user)).toBe(true);
 vi.setSystemTime(new Date('2026-09-28T17:05:00Z'));expect(await loginOpen(client as any,state.user)).toBe(false);
 expect(state.queries.some(q=>q.sql.startsWith('DELETE FROM trusted_login_devices'))).toBe(true);
 expect(state.queries.some(q=>q.sql.startsWith('UPDATE settings_phone_challenges SET consumed_at'))).toBe(true);
 expect(state.queries.some(q=>q.sql.startsWith('UPDATE account_tokens SET used_at'))).toBe(true);
 expect(state.queries.filter(q=>q.sql.startsWith('INSERT INTO audit_log'))).toHaveLength(1);
 await loginOpen(client as any,state.user);expect(state.queries.filter(q=>q.sql.startsWith('INSERT INTO audit_log'))).toHaveLength(1);
});
it('three wrong codes lock across separate attempts, without resetting on resend',async()=>{
 for(let i=1;i<=3;i++){await loginCodeFailed(client as any,state.user);expect(loginIsLocked(state.user)).toBe(i===3);if(i===1)await loginCodeSent(client as any,state.user);}
 expect(state.user.login_2fa_failures).toBe(3);
});
it('a locked or overdue account cannot authenticate even with the correct password',async()=>{
 state.passwordValid=true;state.user.login_2fa_lock_after=new Date(Date.now());
 const result=await checkLoginPassword('staff@example.test','correct');expect(result.status).toBe(423);expect(result.user).toBeUndefined();expect(state.queries.at(-1)?.sql).toBe('COMMIT');
});
it('successful verification clears failed attempts and the third-code deadline',async()=>{
 await resetLoginFailures(client as any,9);
 expect(state.queries[0].sql).toContain('login_2fa_failures=0,login_2fa_sent_count=0,login_2fa_lock_after=NULL');
 expect(state.queries[0].sql).not.toContain('login_locked_at=NULL');
});
