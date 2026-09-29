import {channels,preferenceRecords,savePreferenceRecords} from './marketing-preference-records';
import {marketingPreferencesPage,preferenceRevision} from './marketing-preferences-page';
import type {Express,Request,Response} from 'express';
import pool from './db-pg';
export const unsubscribeConfirmation=(channel='email')=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You are unsubscribed | Fleming Lettings</title></head><body style="margin:0;background:#f5f3f7;font-family:Arial,sans-serif;color:#250b38"><main style="max-width:560px;margin:60px auto;padding:36px;background:white;border-radius:18px;border-top:6px solid #df006b"><h1>You are unsubscribed</h1><p>Your preference has been saved. You will no longer receive marketing ${channel==='email'?'emails':'texts'} from Fleming Lettings.</p><p>Essential messages about your property, tenancy or account will continue.</p><p>No further action is needed.</p></main></body></html>`;
export function registerMarketingUnsubscribe(app:Express){
 const unsubscribe=async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(req.params.token)))return res.sendStatus(404);
  // HEAD probes must not change preferences. Visiting the link opts out immediately.
  if(req.method==='HEAD')return res.sendStatus(200);
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const current=(await c.query('SELECT channel,destination,allowed FROM marketing_permissions WHERE unsubscribe_token=$1 FOR UPDATE',[req.params.token])).rows[0];
   if(!current){await c.query('ROLLBACK');return res.sendStatus(404);}
   if(current.allowed){
    await c.query("UPDATE marketing_permissions SET allowed=FALSE,evidence='Recipient unsubscribed using email or SMS link',updated_at=NOW(),updated_by=NULL WHERE unsubscribe_token=$1",[req.params.token]);
    await c.query("INSERT INTO audit_log(action,entity_type,changes) VALUES('marketing_unsubscribe','marketing',$1)",[JSON.stringify({channel:current.channel,destination:current.destination,allowed:false})]);
   }
   await c.query("UPDATE marketing_recipients r SET status='skipped',error='Marketing permission withdrawn' FROM marketing_campaigns c WHERE r.campaign_id=c.id AND c.channel=$1 AND r.destination=$2 AND r.status='pending'",[current.channel,current.destination]);
   const resolved=await preferenceRecords(c,current);
   resolved.choices[current.channel]=false;
   await savePreferenceRecords(c,current,resolved.choices,current.channel);
   const revision=preferenceRevision(String(req.params.token),resolved.choices);
   const page=marketingPreferencesPage(current.channel,{choices:resolved.choices,available:resolved.available,revision});
   await c.query('COMMIT');res.setHeader('Content-Security-Policy',page.policy);return res.type('html').send(page.html);
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 };
 app.post('/api/public/marketing/preferences/:token',async(req,res)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  if(!/^[a-f0-9-]{36}$/i.test(String(req.params.token)))return res.sendStatus(404);
  if(!req.is('application/json')||!channels.every(key=>typeof req.body.choices?.[key]==='boolean'))return res.status(400).json({error:'Choose each communication preference'});
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const current=(await c.query('SELECT channel,destination,allowed FROM marketing_permissions WHERE unsubscribe_token=$1 FOR UPDATE',[req.params.token])).rows[0];
   if(!current){await c.query('ROLLBACK');return res.sendStatus(404);}
   const resolved=await preferenceRecords(c,current);
   if(req.body.revision!==preferenceRevision(String(req.params.token),resolved.choices)){await c.query('ROLLBACK');return res.status(409).json({error:'Your preferences changed since this page opened. Refresh before saving.'});}
   await savePreferenceRecords(c,current,req.body.choices);
   const revision=preferenceRevision(String(req.params.token),req.body.choices);
   await c.query('COMMIT');res.json({choices:req.body.choices,revision});
  }catch(error){await c.query('ROLLBACK');res.status(400).json({error:'Could not save your preferences. Please refresh and try again.'});}finally{c.release();}
 });
 app.get('/api/public/marketing/unsubscribe/:token',unsubscribe);
 app.post('/api/public/marketing/unsubscribe/:token',unsubscribe);
}
