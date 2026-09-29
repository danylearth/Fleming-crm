import type {PoolClient} from 'pg';
import bcrypt from 'bcryptjs';
import pool from './db-pg';

export const LOGIN_LOCK_MESSAGE='Your account is locked. Contact an administrator to reset your access.';
export const loginIsLocked=(user:any,now=Date.now()):boolean=>Boolean(user?.login_locked_at||(user?.login_2fa_lock_after&&new Date(user.login_2fa_lock_after).getTime()<=now));

// Caller holds the user row lock and commits the security changes, even when
// rejecting authentication. Counters span codes/devices and reset only on success
// or completion of an administrator-issued password reset.
export async function lockLoginAccount(c:PoolClient,user:any,reason:string){
 if(user.login_locked_at)return;
 await c.query('UPDATE users SET login_locked_at=NOW(),login_lock_reason=$2,last_password_change=NOW() WHERE id=$1',[user.id,reason]);
 await c.query('DELETE FROM trusted_login_devices WHERE user_id=$1',[user.id]);
 await c.query('UPDATE settings_phone_challenges SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL',[user.id]);
 await c.query('UPDATE account_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
 await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','user',$1,$3)",[user.id,user.email,JSON.stringify({action:'login_locked',reason})]);
 user.login_locked_at=new Date();user.login_lock_reason=reason;
}
export async function loginOpen(c:PoolClient,user:any):Promise<boolean>{
 if(!user)return false;
 if(loginIsLocked(user)){
  if(!user.login_locked_at)await lockLoginAccount(c,user,'Third verification code not entered within five minutes');
  return false;
 }
 return true;
}
export async function resetLoginFailures(c:PoolClient,id:number){
 await c.query('UPDATE users SET login_password_failures=0,login_2fa_failures=0,login_2fa_sent_count=0,login_2fa_lock_after=NULL WHERE id=$1',[id]);
}
export async function loginCodeFailed(c:PoolClient,user:any){
 const failures=Number(user.login_2fa_failures||0)+1;
 await c.query('UPDATE users SET login_2fa_failures=$2 WHERE id=$1',[user.id,failures]);
 user.login_2fa_failures=failures;
 if(failures>=3)await lockLoginAccount(c,user,'Three incorrect verification codes');
}
export async function loginCodeSent(c:PoolClient,user:any){
 const sent=Number(user.login_2fa_sent_count||0)+1;
 const row=(await c.query("UPDATE users SET login_2fa_sent_count=$2,login_2fa_lock_after=CASE WHEN $2>=3 THEN NOW()+INTERVAL '5 minutes' ELSE NULL END WHERE id=$1 RETURNING login_2fa_lock_after",[user.id,sent])).rows[0];
 return {codesSent:sent,lockAt:row?.login_2fa_lock_after?new Date(row.login_2fa_lock_after).toISOString():null};
}
export async function checkLoginPassword(email:string,password:unknown){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const user=(await c.query('SELECT * FROM users WHERE lower(email)=$1 AND is_active=1 FOR UPDATE',[email])).rows[0];
  if(!user||user.password_setup_required){await c.query('ROLLBACK');return {error:'Invalid login details',status:401};}
  if(!await loginOpen(c,user)){await c.query('COMMIT');return {error:LOGIN_LOCK_MESSAGE,status:423};}
  if(typeof password!=='string'||!await bcrypt.compare(password,user.password)){
   const failures=Math.min(3,Number(user.login_password_failures||0)+1);
   await c.query('UPDATE users SET login_password_failures=$2 WHERE id=$1',[user.id,failures]);
   await c.query('COMMIT');return {error:failures>=3?'Three incorrect passwords. Please request a password reset.':'Invalid login details',status:401,requiresPasswordReset:failures>=3};
  }
  await c.query('UPDATE users SET login_password_failures=0 WHERE id=$1',[user.id]);
  await c.query('COMMIT');return {user};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
// The API enforces the deadline exactly, regardless of this housekeeping timer.
// This persists timed locks/audits even if the user closes the sign-in page.
export async function expireLoginDeadlines(){
 const c=await pool.connect();
 try{await c.query('BEGIN');
  const users=(await c.query('SELECT * FROM users WHERE login_locked_at IS NULL AND login_2fa_lock_after<=NOW() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 100')).rows;
  for(const user of users)await loginOpen(c,user);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
