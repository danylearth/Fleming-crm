import type {Express} from 'express';
import {createChallenge,verifySolution} from 'altcha-lib';
import {deriveKey} from 'altcha-lib/algorithms/pbkdf2';
import type {PoolClient} from 'pg';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {rateLimit} from 'express-rate-limit';
import pool,{query,queryOne,run} from './db-pg';
import {authMiddleware,requireRole,type AuthRequest} from './auth';
import {accountEmail,sendEmail} from './email';

const tokenHash=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');
export function accountInput(body:any){
 const value={name:String(body.name||'').trim(),email:String(body.email||'').trim().toLowerCase(),role:String(body.role||'staff'),department:String(body.department||'').trim(),finance_access:body.finance_access===true};
 if(!value.name||value.name.length>150||!/^\S+@\S+\.\S+$/.test(value.email)||value.email.length>254||!['admin','manager','staff','viewer'].includes(value.role)||value.department.length>150)throw new Error('Enter a valid name, email address and role');
 return value;
}
async function audit(client:PoolClient,actor:AuthRequest['user']|undefined,action:string,id:number,changes:object){
 await client.query('INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,\'user\',$4,$5)',[actor?.id||null,actor?.email||null,action,id,JSON.stringify(changes)]);
}
async function issueLink(client:PoolClient,user:any,kind:'invite'|'reset'){
 const token=crypto.randomBytes(32).toString('base64url');
 await client.query('UPDATE account_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
 await client.query("INSERT INTO account_tokens(user_id,token_hash,kind,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '48 hours')",[user.id,tokenHash(token),kind]);
 const link=`${process.env.CRM_URL||'https://crm.fleminglettings.co.uk'}/account-setup#token=${token}`;
 const result=await sendEmail({to:user.email,...accountEmail(kind,user,link),idempotencyKey:`account-link-${tokenHash(token)}`});
 if(!result.success)throw new Error('The email could not be sent. Please try again.');
}
async function createUser(client:PoolClient,body:any){
 const d=accountInput(body);
 if((await client.query('SELECT id FROM users WHERE LOWER(email)=$1',[d.email])).rows.length)throw new Error('An account with that email already exists');
 const password=await bcrypt.hash(crypto.randomBytes(32).toString('base64url'),12);
 const user=(await client.query('INSERT INTO users(name,email,password,role,department,finance_access,password_setup_required) VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING id,name,email',[d.name,d.email,password,d.role,d.department,d.finance_access])).rows[0];
 await issueLink(client,user,'invite');return user;
}
export function registerAccountRoutes(app:Express){
 const limiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false,message:{error:'Too many requests. Please try again in 15 minutes.'}});
 const challengeSecret=()=>crypto.createHmac('sha256',process.env.JWT_SECRET!).update('password-reset-bot-check').digest('hex');
 const challengeLimiter=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false,message:{error:'Too many bot checks. Please try again in 15 minutes.'}});
 app.get('/api/auth/reset-challenge',challengeLimiter,async(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json(await createChallenge({algorithm:'PBKDF2/SHA-256',cost:1000,counter:crypto.randomInt(1000,2000),deriveKey,hmacSignatureSecret:challengeSecret(),expiresAt:new Date(Date.now()+5*60*1000),data:{purpose:'password-reset'}}));
 });
 app.post('/api/auth/forgot-password',limiter,async(req,res)=>{
  if(typeof req.body.email!=='string'||req.body.email.length>254||!/^\S+@\S+\.\S+$/.test(req.body.email.trim()))return res.status(400).json({error:'Enter a valid email address'});
  let payload;
  try{
   if(typeof req.body.altcha!=='string'||req.body.altcha.length>8000)throw Error();
   payload=JSON.parse(Buffer.from(req.body.altcha,'base64').toString());
   if(payload.challenge?.parameters?.data?.purpose!=='password-reset'||payload.challenge.parameters.algorithm!=='PBKDF2/SHA-256'||payload.challenge.parameters.cost!==1000)throw Error();
   if(!(await verifySolution({challenge:payload.challenge,solution:payload.solution,deriveKey,hmacSignatureSecret:challengeSecret()})).verified)throw Error();
  }catch{return res.status(400).json({error:'Complete the bot check again before submitting'});}
  await run('DELETE FROM auth_challenge_uses WHERE expires_at<NOW()');
  const used=await query('INSERT INTO auth_challenge_uses(signature_hash,expires_at) VALUES($1,to_timestamp($2)) ON CONFLICT DO NOTHING RETURNING signature_hash',[tokenHash(payload.challenge.signature),payload.challenge.parameters.expiresAt]);
  if(!used.length)return res.status(400).json({error:'This bot check has already been used. Complete a new check.'});
  const email=String(req.body.email||'').trim().toLowerCase();
  const user=await queryOne('SELECT id,email FROM users WHERE LOWER(email)=$1 AND is_active=1',[email]);
  if(user){const rows=await query("INSERT INTO account_requests(kind,user_id,email) VALUES('reset',$1,$2) ON CONFLICT DO NOTHING RETURNING id",[user.id,user.email]);if(rows.length)await run("INSERT INTO audit_log(action,entity_type,entity_id,changes) VALUES('update','user',$1,$2)",[user.id,JSON.stringify({action:'password_reset_requested'})]);}
  res.json({message:'Request received and pending administrator approval. Please contact your manager or administrator to expedite this process.'});
 });
 app.post('/api/auth/set-password',rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false,message:{error:'Too many requests. Please try again in 15 minutes.'}}),async(req,res)=>{
  const token=String(req.body.token||''),password=req.body.password;
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)||typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)return res.status(400).json({error:'Enter a password of at least 12 characters (maximum 72 bytes), using a valid account link'});
  const client=await pool.connect();let user:any;
  try{await client.query('BEGIN');
   const row=(await client.query('SELECT t.id,t.user_id FROM account_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>NOW() AND u.is_active=1 FOR UPDATE OF t,u',[tokenHash(token)])).rows[0];
   if(!row){await client.query('ROLLBACK');return res.status(400).json({error:'This link has expired or has already been used. Ask an administrator to send another.'});}
   user=(await client.query('UPDATE users SET password=$1,password_setup_required=FALSE,last_password_change=NOW() WHERE id=$2 RETURNING id,name,email',[await bcrypt.hash(password,12),row.user_id])).rows[0];
   await client.query('UPDATE account_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
   await audit(client,undefined,'update',user.id,{action:'password_set_by_account_link'});await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  const result=await sendEmail({to:user.email,...accountEmail('updated',user)});
  res.json({success:true,message:result.success?'Password saved. You can now sign in.':'Password saved. You can now sign in. The confirmation email could not be delivered.'});
 });
 app.get('/api/account-requests',authMiddleware,requireRole('admin','manager'),async(req:AuthRequest,res)=>{
  res.json(await query(`SELECT r.*,u.name AS requester_name FROM account_requests r LEFT JOIN users u ON u.id=r.requested_by WHERE r.status='pending' AND ($1='admin' OR r.requested_by=$2) ORDER BY r.created_at`,[req.user!.role,req.user!.id]));
 });
 app.post('/api/users',authMiddleware,requireRole('admin','manager'),async(req:AuthRequest,res)=>{
  const client=await pool.connect();try{await client.query('BEGIN');const d=accountInput(req.body);
   if(req.user!.role==='manager'){
    const approver=Number(req.body.approver_id);
    if(!Number.isSafeInteger(approver)||!(await client.query("SELECT id FROM users WHERE id=$1 AND role='admin' AND is_active=1",[approver])).rows.length)throw new Error('Choose an active administrator to approve the request');
    const row=(await client.query("INSERT INTO account_requests(kind,email,payload,requested_by,approver_id) VALUES('create',$1,$2,$3,$4) RETURNING id",[d.email,JSON.stringify(d),req.user!.id,approver])).rows[0];
    await audit(client,req.user,'create',req.user!.id,{action:'account_creation_requested',request_id:row.id,email:d.email,approver_id:approver});await client.query('COMMIT');return res.json({requested:true,message:'Account request sent to the selected administrator.'});
   }
   const user=await createUser(client,d);await audit(client,req.user,'create',user.id,{...d,action:'account_invited'});await client.query('COMMIT');res.json({...user,message:'Account invitation emailed. The user must set a password within 48 hours.'});
  }catch(e:any){await client.query('ROLLBACK');res.status(400).json({error:e.code==='23505'?'An account or pending request already exists for this email':e.message});}finally{client.release();}
 });
 app.post('/api/account-requests/:id/decision',authMiddleware,requireRole('admin'),async(req:AuthRequest,res)=>{
  if(!['approve','reject'].includes(req.body.decision))return res.status(400).json({error:'Choose approve or reject'});
  const client=await pool.connect();try{await client.query('BEGIN');
   const row=(await client.query("SELECT * FROM account_requests WHERE id=$1 AND status='pending' FOR UPDATE",[req.params.id])).rows[0];
   if(!row)throw new Error('This request has already been handled');
   if(row.approver_id&&row.approver_id!==req.user!.id)throw new Error('This request is assigned to another administrator');
   if(req.body.decision==='approve'){
    if(row.kind==='create'){const user=await createUser(client,row.payload);await audit(client,req.user,'create',user.id,{action:'account_invited',request_id:row.id,...row.payload});}
    else{const user=(await client.query('SELECT id,name,email,password_setup_required FROM users WHERE id=$1 AND is_active=1 FOR UPDATE',[row.user_id])).rows[0];if(!user)throw new Error('This account is no longer active');await issueLink(client,user,user.password_setup_required?'invite':'reset');}
   }
   await client.query('UPDATE account_requests SET status=$1,decided_at=NOW(),decided_by=$2 WHERE id=$3',[req.body.decision==='approve'?'approved':'rejected',req.user!.id,row.id]);
   await audit(client,req.user,'update',row.user_id||req.user!.id,{action:'account_request_decided',request_id:row.id,decision:req.body.decision});await client.query('COMMIT');res.json({success:true});
  }catch(e:any){await client.query('ROLLBACK');res.status(400).json({error:e.message});}finally{client.release();}
 });
 app.put('/api/users/:id/reset-password',authMiddleware,requireRole('admin'),async(req:AuthRequest,res)=>{
  const client=await pool.connect();try{await client.query('BEGIN');const user=(await client.query('SELECT id,name,email,password_setup_required FROM users WHERE id=$1 AND is_active=1 FOR UPDATE',[req.params.id])).rows[0];if(!user)throw new Error('Active user not found');
   await issueLink(client,user,user.password_setup_required?'invite':'reset');await audit(client,req.user,'update',user.id,{action:'account_link_sent'});
   await client.query("UPDATE account_requests SET status='approved',decided_at=NOW(),decided_by=$1 WHERE user_id=$2 AND kind='reset' AND status='pending'",[req.user!.id,user.id]);
   await client.query('COMMIT');res.json({success:true,message:'A secure account link has been emailed. It expires in 48 hours.'});
  }catch(e:any){await client.query('ROLLBACK');res.status(400).json({error:e.message});}finally{client.release();}
 });
}
