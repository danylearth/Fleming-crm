import crypto from 'crypto';
import type {Express} from 'express';
import pool, {queryOne} from './db-pg';
import {authMiddleware, requirePermission, type AuthRequest} from './auth';
import {encryptToken, decryptToken} from './bank-feed';

const base = 'https://api.freeagent.com/v2';
export function freeAgentConfig() {
  const {FREEAGENT_CLIENT_ID:clientId, FREEAGENT_CLIENT_SECRET:clientSecret, FREEAGENT_REDIRECT_URI:redirectUri, BANK_FEED_ENCRYPTION_KEY:key} = process.env;
  return clientId && clientSecret && redirectUri && key ? {clientId,clientSecret,redirectUri} : null;
}
export function freeAgentAuthUrl(state:string) {
  const c=freeAgentConfig(); if(!c) throw new Error('FreeAgent is not configured');
  return `${base}/approve_app?${new URLSearchParams({client_id:c.clientId,response_type:'code',redirect_uri:c.redirectUri,state})}`;
}
async function tokenRequest(params:Record<string,string>) {
  const c=freeAgentConfig(); if(!c) throw new Error('FreeAgent is not configured');
  const response=await fetch(`${base}/token_endpoint`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams(params),signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error('FreeAgent authorisation could not be completed. Reconnect the account.');
  const data=await response.json() as {access_token:string;refresh_token?:string;expires_in?:number};
  if(!data.access_token)throw new Error('FreeAgent returned no access token');
  return data;
}
// Only follow pagination on the official API origin; never forward a bearer token elsewhere.
export async function freeAgentPages<T>(url:string,key:string,accessToken:string):Promise<T[]> {
  const rows:T[]=[];const visited=new Set<string>();
  while(url) {
    const target=new URL(url);
    if(target.origin!=='https://api.freeagent.com'||!target.pathname.startsWith('/v2/')||visited.has(url)||visited.size>=1000)throw new Error('Invalid FreeAgent pagination');
    visited.add(url);
    const response=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`FreeAgent data could not be read (${response.status}). Try again or reconnect.`);
    const data=await response.json() as Record<string,T[]>;
    if(!Array.isArray(data[key]))throw new Error('FreeAgent returned an unexpected response');
    rows.push(...data[key]);
    url=response.headers.get('link')?.split(',').map(v=>v.trim()).find(v=>/rel="next"/.test(v))?.match(/<([^>]+)>/)?.[1] || '';
  }
  return rows;
}
export function registerFreeAgentRoutes(app:Express) {
  const office=(state:string)=>`${process.env.FRONTEND_URL || 'https://crm.fleminglettings.co.uk'}/settings?freeagent=${state}`;
  app.get('/api/freeagent/status',authMiddleware,requirePermission('admin'),async(_req,res)=>{
    const connection=await queryOne("SELECT id,status,last_synced_at,last_error FROM bank_feed_connections WHERE provider='freeagent' ORDER BY id DESC LIMIT 1");
    res.json({configured:Boolean(freeAgentConfig()),redirect_uri:process.env.FREEAGENT_REDIRECT_URI || 'https://fleming-crm-api.fly.dev/api/freeagent/callback',connection});
  });
  app.post('/api/freeagent/connect',authMiddleware,requirePermission('admin'),async(req:AuthRequest,res)=>{
    if(!freeAgentConfig())return res.status(503).json({error:'FreeAgent app credentials are not configured'});
    const state=crypto.randomBytes(32).toString('base64url');
    await queryOne("INSERT INTO bank_feed_connections(provider,status,state_hash,created_by) VALUES('freeagent','pending',$1,$2) RETURNING id",[crypto.createHash('sha256').update(state).digest('hex'),req.user.id]);
    res.json({url:freeAgentAuthUrl(state)});
  });
  app.get('/api/freeagent/callback',async(req,res)=>{
    const c=freeAgentConfig();const state=String(req.query.state || '');const code=String(req.query.code || '');
    if(!c||!state||!code)return res.redirect(303,office('error'));
    // Clearing state atomically claims the pending connection without introducing an unsupported status.
    const row=await queryOne("UPDATE bank_feed_connections SET state_hash=NULL,updated_at=NOW() WHERE provider='freeagent' AND status='pending' AND state_hash=$1 AND created_at>NOW()-INTERVAL '30 minutes' RETURNING id",[crypto.createHash('sha256').update(state).digest('hex')]);
    if(!row)return res.redirect(303,office('error'));
    try {
      const token=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:c.redirectUri});
      if(!token.refresh_token)throw new Error('FreeAgent did not provide an offline token');
      await queryOne("UPDATE bank_feed_connections SET status='connected',provider_name='FreeAgent',refresh_token_encrypted=$1,last_error=NULL,updated_at=NOW() WHERE id=$2 RETURNING id",[encryptToken(token.refresh_token),row.id]);
      res.redirect(303,office('connected'));
    }catch{
      await queryOne("UPDATE bank_feed_connections SET status='error',last_error='Authorisation failed. Reconnect FreeAgent.' WHERE id=$1 RETURNING id",[row.id]);res.redirect(303,office('error'));
    }
  });
  app.post('/api/freeagent/sync',authMiddleware,requirePermission('admin'),async(req:AuthRequest,res)=>{
    const client=await pool.connect();let locked=false;let connection:any;
    try {
      locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('freeagent-sync')) AS locked")).rows[0].locked;
      if(!locked)return res.status(409).json({error:'FreeAgent is already syncing'});
      connection=(await client.query("SELECT * FROM bank_feed_connections WHERE provider='freeagent' AND status='connected' ORDER BY id DESC LIMIT 1")).rows[0];
      if(!connection)return res.status(409).json({error:'Connect FreeAgent first'});
      const token=await tokenRequest({grant_type:'refresh_token',refresh_token:decryptToken(connection.refresh_token_encrypted)});
      // Persist rotated token immediately, even if a later data request fails.
      if(token.refresh_token)await client.query('UPDATE bank_feed_connections SET refresh_token_encrypted=$1,updated_at=NOW() WHERE id=$2',[encryptToken(token.refresh_token),connection.id]);
      const accounts=await freeAgentPages<{url:string;currency:string}>(`${base}/bank_accounts?per_page=100`,'bank_accounts',token.access_token);
      const from=new Date(connection.last_synced_at || Date.now()-90*86400000);from.setUTCDate(from.getUTCDate()-7);
      let imported=0;await client.query('BEGIN');
      for(const account of accounts) {
        const params=new URLSearchParams({bank_account:account.url,from_date:from.toISOString().slice(0,10),to_date:new Date().toISOString().slice(0,10),per_page:'100'});
        const transactions=await freeAgentPages<{url:string;dated_on:string;description:string;amount:string}>(`${base}/bank_transactions?${params}`,'bank_transactions',token.access_token);
        for(const t of transactions){
          if(!t.url || !/^\d{4}-\d{2}-\d{2}$/.test(t.dated_on)||!Number.isFinite(Number(t.amount)))throw new Error('FreeAgent returned an invalid transaction');
          const result=await client.query("INSERT INTO bank_feed_transactions(connection_id,external_id,account_id,booked_at,description,amount,currency) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(external_id) DO NOTHING",[connection.id,`freeagent:${t.url}`,account.url,t.dated_on,t.description,Number(t.amount),account.currency || 'GBP']);
          imported+=result.rowCount || 0;
        }
      }
      await client.query('UPDATE bank_feed_connections SET last_synced_at=NOW(),last_error=NULL,updated_at=NOW() WHERE id=$1',[connection.id]);
      await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'sync','bank_feed_connection',$3,$4)",[req.user.id,req.user.email,connection.id,JSON.stringify({provider:'freeagent',imported})]);
      await client.query('COMMIT');res.json({imported,message:'Transactions imported into Bank Feed for review. Rent and expenses have not been posted automatically.'});
    }catch(error){
      await client.query('ROLLBACK');const message=error instanceof Error?error.message:'FreeAgent sync failed';
      if(connection)await client.query('UPDATE bank_feed_connections SET last_error=$1 WHERE id=$2',[message,connection.id]);
      res.status(502).json({error:message});
    }finally{if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('freeagent-sync'))");client.release();}
  });
}
