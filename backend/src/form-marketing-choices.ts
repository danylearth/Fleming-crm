import type {PoolClient} from 'pg';
import {randomUUID} from 'crypto';
import {normalizeUkPhone} from './sms';
import {channels,sourceChoices} from './marketing-preference-records';
export async function recordFormMarketingChoices(client:Pick<PoolClient,'query'>,email:string,phone:string,data:Record<string,unknown>){
 const choices=sourceChoices({preferences:data});
 const normalizedEmail=String(email||'').trim().toLowerCase(),normalizedPhone=normalizeUkPhone(String(phone||''));
 for(const channel of channels){
  const destination=channel==='email'?normalizedEmail:channel==='post'?(normalizedEmail||normalizedPhone):normalizedPhone;
  if(!destination){choices[channel]=false;continue;}
  const result=await client.query("INSERT INTO marketing_permissions(channel,destination,allowed,evidence,unsubscribe_token) VALUES($1,$2,$3,'Application form channel preferences',$4) ON CONFLICT(channel,destination) DO UPDATE SET allowed=CASE WHEN marketing_permissions.evidence='Preferences link created for an outbound email; no marketing consent granted' THEN EXCLUDED.allowed ELSE marketing_permissions.allowed AND EXCLUDED.allowed END,evidence=CASE WHEN marketing_permissions.evidence='Preferences link created for an outbound email; no marketing consent granted' OR NOT EXCLUDED.allowed THEN EXCLUDED.evidence ELSE marketing_permissions.evidence END,updated_at=NOW() RETURNING allowed",[channel,destination,choices[channel],randomUUID()]);
  // A fresh form must not silently reverse an earlier unsubscribe.
  if(result.rows[0]?.allowed===false)choices[channel]=false;
  if(!choices[channel]&&['email','sms'].includes(channel))await client.query("UPDATE marketing_recipients r SET status='skipped',error='Marketing permission withdrawn' FROM marketing_campaigns c WHERE r.campaign_id=c.id AND c.channel=$1 AND r.destination=$2 AND r.status='pending'",[channel,destination]);
 }
 return choices;
}
export const marketingChoicesList=(choices:Record<string,boolean>)=>channels.filter(k=>choices[k]).map(k=>({email:'Email',sms:'SMS',phone:'Phone',post:'Post'}[k])).join(',');
