import {createHash,createHmac,randomInt,randomUUID,timingSafeEqual} from 'crypto';
import type {PoolClient} from 'pg';
import type {Express} from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import pool,{queryOne} from './db-pg';
import {authMiddleware,requireRole,type AuthRequest} from './auth';
import {normalizeUkPhone,sendSecurityCode} from './sms';
import {sendLoginVerificationEmail} from './email';
import {LOGIN_CODE_RESEND_SECONDS,VERIFICATION_CODE_SECONDS} from './verification-code-policy';
import {loginOpen,loginCodeSent,loginCodeFailed,LOGIN_LOCK_MESSAGE} from './login-security';

type Purpose='company-settings'|'trusted-phone'|'staff-trusted-phone'|'login';
export const maskPhone=(phone:string|null)=>phone?`•••• ••• ${phone.slice(-4)}`:null;
export function trustedPhone(value:unknown):string {
  const phone=typeof value==='string'?normalizeUkPhone(value):'';
  if(!/^\+44[127]\d{9}$/.test(phone))throw Error('Enter a valid UK mobile or landline number');
  return phone;
}
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
export const payloadHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const sessionHash=(req:AuthRequest)=>createHash('sha256').update(req.headers.authorization||String(req.headers['user-agent']||'')).digest('hex');
const codeHash=(id:string,index:number,code:string)=>{
  // Never store six-digit codes as plain hashes that can be brute-forced from a database dump.
  const secret=process.env.JWT_SECRET;
  if(!secret)throw Error('Phone verification is not configured');
  return createHmac('sha256',secret).update(`${id}:${index}:${code}`).digest('hex');
};
export function codesMatch(id:string,hashes:string[],codes:unknown):boolean {
  if(!Array.isArray(codes)||codes.length!==hashes.length)return false;
  return hashes.map((hash,i)=>typeof codes[i]==='string'&&/^\d{6}$/.test(codes[i])&&timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(codeHash(id,i,codes[i]),'hex'))).every(Boolean);
}
export async function issuePhoneChallenge(req:AuthRequest,purpose:Purpose,payload:unknown,newPhone?:string,deliveryMethod:'phone'|'email'='phone') {
  const c=await pool.connect();
  let committed=false;
  try {
    await c.query('BEGIN');
    const user=(await c.query('SELECT trusted_phone,email,name,id,login_locked_at,login_2fa_lock_after,login_2fa_sent_count FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
    if(purpose==='login'){
      if(!await loginOpen(c,user)){await c.query('COMMIT');committed=true;throw Error(LOGIN_LOCK_MESSAGE);}
      if(Number(user.login_2fa_sent_count||0)>=3)throw Error('Three codes have been sent. Enter your latest code before the five-minute deadline or contact an administrator.');
    }
    if(deliveryMethod==='email'&&(purpose!=='login'||!user?.email))throw Error('Email verification is not available for this request.');
    if(deliveryMethod==='phone'&&purpose!=='trusted-phone'&&!user?.trusted_phone)throw Error('A trusted number is required. Ask an administrator to set up your number.');
    const recent=(await c.query("SELECT COUNT(*)::int AS count,MAX(created_at) AS latest FROM settings_phone_challenges WHERE user_id=$1 AND created_at>NOW()-INTERVAL '15 minutes'",[req.user.id])).rows[0];
    const cooldownSeconds=purpose==='login'?LOGIN_CODE_RESEND_SECONDS:60;
    if(recent.latest&&Date.now()-new Date(recent.latest).getTime()<cooldownSeconds*1000)throw Error(purpose==='login'?'Please wait five minutes after your last code before requesting a new one.':'Please wait before requesting another code.');
    if(recent.count>=3)throw Error('Please wait before requesting another code. Maximum three requests in 15 minutes.');
    const phones=deliveryMethod==='email'?[user.email]:purpose!=='trusted-phone'?[user.trusted_phone]:[...(user.trusted_phone?[user.trusted_phone]:[]),newPhone];
    const id=randomUUID(),codes=phones.map(()=>String(randomInt(100000,1000000)));
    const hashes=codes.map((code,i)=>codeHash(id,i,code));
    await c.query('UPDATE settings_phone_challenges SET consumed_at=NOW() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL',[req.user.id,purpose]);
    await c.query("INSERT INTO settings_phone_challenges(id,user_id,purpose,session_hash,payload_hash,trusted_phone,code_hashes,expires_at,delivery_method) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()+($8::int * INTERVAL '1 second'),$9)",[id,req.user.id,purpose,sessionHash(req),payloadHash(payload),user.trusted_phone,JSON.stringify(hashes),VERIFICATION_CODE_SECONDS,deliveryMethod]);
    // Security codes must fail closed; development simulation must never authorize a save.
    if(process.env.ALLOW_SIMULATED_MESSAGES==='true')throw Error('SMS simulation cannot be used for security verification');
    for(let i=0;i<phones.length;i++) {
      const action=purpose==='company-settings'?'save company settings':purpose==='staff-trusted-phone'?'change a staff trusted number':purpose==='login'?'sign in on a new device':i===phones.length-1?'confirm your new trusted number':'replace your trusted number';
      const delivered=deliveryMethod==='email'?await sendLoginVerificationEmail(phones[i],codes[i],user.name):await sendSecurityCode(phones[i],codes[i],action,user.name);
      if(!delivered)throw Error(purpose==='login'?'Unable to deliver your sign-in verification code. Please try again or choose another verification method.':'Unable to send your verification code. No changes have been saved.');
    }
    const loginLimits=purpose==='login'?await loginCodeSent(c,{...user,id:req.user.id}):{};
    await c.query('COMMIT');committed=true;
    return {challengeId:id,destinations:deliveryMethod==='email'?phones:phones.map(maskPhone),methods:phones.map(phone=>deliveryMethod==='email'?'email':phone.startsWith('+447')?'text message':'voice call'),expiresInSeconds:VERIFICATION_CODE_SECONDS,...(purpose==='login'?{resendAfterSeconds:LOGIN_CODE_RESEND_SECONDS,...loginLimits}:{})};
  }catch(e){if(!committed)await c.query('ROLLBACK');throw e;}finally{c.release();}
}

// The caller owns a transaction. On failure it must COMMIT attempt counters before returning.
// On success consumption and the protected change commit atomically.
export async function consumePhoneChallenge(c:PoolClient,req:AuthRequest,purpose:Purpose,payload:unknown):Promise<boolean> {
  const proof=req.body.verification;
  if(typeof proof?.challengeId!=='string'||! /^[0-9a-f-]{36}$/i.test(proof.challengeId))return false;
  const user=(await c.query('SELECT trusted_phone,id,email,login_locked_at,login_2fa_lock_after,login_2fa_failures FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
  if(purpose==='login'&&!await loginOpen(c,user))return false;
  const row=(await c.query('SELECT *,expires_at>NOW() AS valid_time FROM settings_phone_challenges WHERE id=$1 AND user_id=$2 FOR UPDATE',[proof.challengeId,req.user.id])).rows[0];
  if(!row||row.consumed_at||!row.valid_time||row.attempts>=5||row.purpose!==purpose||row.session_hash!==sessionHash(req)||row.payload_hash!==payloadHash(payload)||row.trusted_phone!==user.trusted_phone)return false;
  await c.query('UPDATE settings_phone_challenges SET attempts=attempts+1 WHERE id=$1',[row.id]);
  if(!codesMatch(row.id,row.code_hashes,proof.codes)){
    if(purpose==='login')await loginCodeFailed(c,{...user,id:req.user.id});
    return false;
  }
  await c.query('UPDATE settings_phone_challenges SET consumed_at=NOW() WHERE id=$1',[row.id]);
  if(user.trusted_phone&&row.delivery_method!=='email')await c.query('UPDATE users SET trusted_phone_verified_at=NOW() WHERE id=$1',[req.user.id]);
  return true;
}

export function registerTrustedPhone(app:Express) {
  const limits=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:true,legacyHeaders:false});
  app.get('/api/auth/trusted-phone',authMiddleware,async(req:AuthRequest,res)=>{
    const user=await queryOne('SELECT trusted_phone,trusted_phone_verified_at FROM users WHERE id=$1',[req.user.id]);
    res.set('Cache-Control','no-store').json({number:maskPhone(user.trusted_phone),verified:!!user.trusted_phone_verified_at});
  });
  app.post('/api/auth/trusted-phone/challenge',authMiddleware,limits,async(req:AuthRequest,res)=>{
    try {
      const phone=trustedPhone(req.body.phone);
      const user=await queryOne('SELECT password,trusted_phone FROM users WHERE id=$1',[req.user.id]);
      if(typeof req.body.password!=='string'||!await bcrypt.compare(req.body.password,user.password))return res.status(403).json({error:'Enter your current password to update your trusted number'});
      if(phone===user.trusted_phone)return res.status(400).json({error:'This is already your trusted number'});
      res.set('Cache-Control','no-store').json(await issuePhoneChallenge(req,'trusted-phone',{phone},phone));
    }catch(e){res.status(400).json({error:(e as Error).message});}
  });
  app.put('/api/auth/trusted-phone',authMiddleware,limits,async(req:AuthRequest,res)=>{
    let phone:string;try{phone=trustedPhone(req.body.phone);}catch(e){return res.status(400).json({error:(e as Error).message});}
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      if(!await consumePhoneChallenge(c,req,'trusted-phone',{phone})){await c.query('COMMIT');return res.status(403).json({error:'Verification failed or expired. Check your codes or request new ones.'});}
      await c.query('UPDATE users SET trusted_phone=$1,trusted_phone_verified_at=NOW(),last_password_change=NOW() WHERE id=$2',[phone,req.user.id]);
      await c.query('DELETE FROM trusted_login_devices WHERE user_id=$1',[req.user.id]);
      await c.query('UPDATE settings_phone_challenges SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL',[req.user.id]);
      await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','trusted_phone',$1,$3)",[req.user.id,req.user.email,JSON.stringify({number:maskPhone(phone),phone_verified:true})]);
      await c.query('COMMIT');res.json({number:maskPhone(phone),verified:true});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
  app.post('/api/users/:id/trusted-phone/challenge',authMiddleware,requireRole('admin'),limits,async(req:AuthRequest,res)=>{
    try {
      const targetId=Number(req.params.id),phone=trustedPhone(req.body.phone);
      if(targetId===req.user.id)return res.status(400).json({error:'Change your own trusted number in Settings'});
      if(!Number.isSafeInteger(targetId)||!await queryOne('SELECT id FROM users WHERE id=$1 AND is_active=1',[targetId]))return res.status(404).json({error:'Active staff account not found'});
      res.set('Cache-Control','no-store').json(await issuePhoneChallenge(req,'staff-trusted-phone',{targetId,phone}));
    }catch(e){res.status(400).json({error:(e as Error).message});}
  });
  app.put('/api/users/:id/trusted-phone',authMiddleware,requireRole('admin'),limits,async(req:AuthRequest,res)=>{
    const targetId=Number(req.params.id);
    if(!Number.isSafeInteger(targetId)||targetId===req.user.id)return res.status(400).json({error:'Use Settings to change your own trusted number'});
    let phone:string;try{phone=trustedPhone(req.body.phone);}catch(e){return res.status(400).json({error:(e as Error).message});}
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      // Consistent user lock ordering prevents two admins updating each other from deadlocking.
      await c.query('SELECT id FROM users WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[[req.user.id,targetId]]);
      if(!await consumePhoneChallenge(c,req,'staff-trusted-phone',{targetId,phone})){await c.query('COMMIT');return res.status(403).json({error:'Verification failed or expired. Request a new code.'});}
      const result=await c.query('UPDATE users SET trusted_phone=$1,trusted_phone_verified_at=NULL,last_password_change=NOW() WHERE id=$2 AND is_active=1',[phone,targetId]);
      if(!result.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'Active staff account not found'});}
      await c.query('DELETE FROM trusted_login_devices WHERE user_id=$1',[targetId]);
      await c.query('UPDATE settings_phone_challenges SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL',[targetId]);
      await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','trusted_phone',$3,$4)",[req.user.id,req.user.email,targetId,JSON.stringify({number:maskPhone(phone),admin_phone_verified:true})]);
      await c.query('COMMIT');res.json({number:maskPhone(phone),verified:false});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
}
