import {createHash,randomBytes} from 'crypto';
import type {Express,Response} from 'express';
import rateLimit from 'express-rate-limit';
import pool,{queryOne} from './db-pg';
import {generateToken,type AuthRequest} from './auth';
import {consumePhoneChallenge,issuePhoneChallenge,maskPhone,payloadHash} from './settings-phone-verification';
import {loginOpen,loginIsLocked,resetLoginFailures,expireLoginDeadlines,LOGIN_LOCK_MESSAGE} from './login-security';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const agentHash=(req:AuthRequest)=>hash(String(req.headers['user-agent']||''));
const loginPayload=(user:any)=>({passwordChangedAt:user.last_password_change?new Date(user.last_password_change).toISOString():null,email:String(user.email||'').trim().toLowerCase()});
const cookieName=(user:any)=>`fleming_device_${user.id}`;
export async function knownLoginDevice(req:AuthRequest,user:any):Promise<boolean> {
  if(loginIsLocked(user))return false;
  if(!user.trusted_phone&&!user.email)return false;
  const value=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName(user)}=`))?.split('=')[1];
  if(!value||!/^[a-f0-9]{64}$/.test(value))return false;
  return !!await queryOne('SELECT 1 FROM trusted_login_devices WHERE token_hash=$1 AND user_id=$2 AND user_agent_hash=$3 AND expires_at>NOW() AND created_at>COALESCE($4::timestamptz,\'1970-01-01\'::timestamptz)',[hash(value),user.id,agentHash(req),user.last_password_change]);
}
export async function beginLoginVerification(req:AuthRequest,res:Response,user:any) {
  if(loginIsLocked(user))return res.status(423).json({error:LOGIN_LOCK_MESSAGE});
  // This handler runs only after the login route has checked the password, including on delivery selection.
  const options=[...(user.trusted_phone?[{method:'phone',destination:maskPhone(user.trusted_phone),label:user.trusted_phone.startsWith('+447')?'Text message (SMS)':'Telephone call'}]:[]),...(user.email?[{method:'email',destination:user.email,label:'Email'}]:[])];
  if(!options.length)return res.status(403).json({error:'Your account needs a saved verification email or trusted phone number. Please contact an administrator.'});
  const method=req.body?.verificationMethod;
  if(method===undefined)return res.set('Cache-Control','no-store').json({requiresTwoFactor:true,selectDelivery:true,options});
  if(!options.some(option=>option.method===method))return res.status(400).json({error:'Choose an available verification method.'});
  req.user={id:user.id,email:user.email,name:user.name,role:user.role};
  try {res.set('Cache-Control','no-store').json({requiresTwoFactor:true,...await issuePhoneChallenge(req,'login',loginPayload(user),undefined,method)});}
  catch(e){res.status(400).json({error:(e as Error).message});}
}
export function loginResult(user:any,authenticatedAtMs=Date.now()) {
  return {user:{id:user.id,email:user.email,role:user.role,name:user.name,avatar_url:user.avatar_url,accent_color:user.accent_color,appearance:user.appearance,department:user.department,phone:user.phone,office_extension:user.office_extension,contact_email:user.contact_email,finance_access:user.finance_access,last_login:new Date().toISOString()},token:generateToken({id:user.id,email:user.email,role:user.role,name:user.name},authenticatedAtMs)};
}
export function registerLoginVerification(app:Express) {
  if(process.env.NODE_ENV==='production'){
    const sweep=()=>void expireLoginDeadlines().catch(()=>console.error('Login lock deadline check failed'));
    sweep();const timer=setInterval(sweep,15000);timer.unref();
  }
  const limits=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false,message:{error:'Too many verification attempts. Please try again later.'}});
  app.post('/api/auth/login/resend',limits,async(req:AuthRequest,res)=>{
    const id=req.body.challengeId;
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return res.status(403).json({error:'Please sign in again to request a new code.'});
    const previous=await queryOne("SELECT * FROM settings_phone_challenges WHERE id=$1 AND purpose='login' AND consumed_at IS NULL AND expires_at>NOW() AND attempts<5",[id]);
    if(!previous||previous.session_hash!==agentHash(req))return res.status(403).json({error:'Please sign in again to request a new code.'});
    const user=await queryOne('SELECT * FROM users WHERE id=$1 AND is_active=1 AND NOT COALESCE(password_setup_required,false)',[previous.user_id]);
    if(!user||previous.payload_hash!==payloadHash(loginPayload(user))||previous.trusted_phone!==user.trusted_phone)return res.status(403).json({error:'Please sign in again to request a new code.'});
    req.user={id:user.id,email:user.email,name:user.name,role:user.role};
    try{res.set('Cache-Control','no-store').json({requiresTwoFactor:true,...await issuePhoneChallenge(req,'login',loginPayload(user),undefined,previous.delivery_method)});}
    catch(e){res.status(400).json({error:(e as Error).message});}
  });
  app.post('/api/auth/login/verify',limits,async(req:AuthRequest,res)=>{
    const authenticatedAtMs=Date.now();
    const id=req.body.verification?.challengeId;
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return res.status(403).json({error:'Invalid verification request'});
    const found=await queryOne("SELECT user_id,delivery_method FROM settings_phone_challenges WHERE id=$1 AND purpose='login'",[id]);
    if(!found)return res.status(403).json({error:'Verification failed or expired'});
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      const user=(await c.query('SELECT * FROM users WHERE id=$1 AND is_active=1 AND NOT COALESCE(password_setup_required,false) FOR UPDATE',[found.user_id])).rows[0];
      if(!user){await c.query('ROLLBACK');return res.status(403).json({error:'Verification failed or expired'});}
      if(!await loginOpen(c,user)){await c.query('COMMIT');return res.status(423).json({error:LOGIN_LOCK_MESSAGE});}
      req.user={id:user.id,email:user.email,name:user.name,role:user.role};
      if(!await consumePhoneChallenge(c,req,'login',loginPayload(user))){const current=(await c.query('SELECT login_locked_at FROM users WHERE id=$1',[user.id])).rows[0];await c.query('COMMIT');return res.status(current?.login_locked_at?423:403).json({error:current?.login_locked_at?LOGIN_LOCK_MESSAGE:'Verification failed or expired. Check your code or sign in again.'});}
      await resetLoginFailures(c,user.id);
      let deviceToken:string|undefined;
      if(req.body.rememberDevice===true){
        deviceToken=randomBytes(32).toString('hex');
        await c.query("INSERT INTO trusted_login_devices(token_hash,user_id,user_agent_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 days')",[hash(deviceToken),user.id,agentHash(req)]);
      }
      await c.query('UPDATE users SET last_login=NOW() WHERE id=$1',[user.id]);
      await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'login','user',$1,$3)",[user.id,user.email,JSON.stringify({two_factor_verified:true,verification_method:found.delivery_method,remembered_device:!!deviceToken})]);
      await c.query('COMMIT');
      if(deviceToken)res.cookie(cookieName(user),deviceToken,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/auth',maxAge:30*24*60*60*1000});
      res.set('Cache-Control','no-store').json(loginResult(user,authenticatedAtMs));
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
}
