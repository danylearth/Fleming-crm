import type {PoolClient} from 'pg';
import {randomUUID} from 'crypto';
import {normalizeUkPhone} from './sms';

export const channels=['email','sms','phone','post'] as const;
type Channel=typeof channels[number];
type Choices=Record<Channel,boolean>;
const labels={email:'Email',sms:'SMS',phone:'Phone',post:'Post'};
const bool=(v:unknown)=>v===true||v===1||v==='true'||v==='1'||v==='on';
export function sourceChoices(row:any):Choices {
 const data=typeof row.preferences==='string'?JSON.parse(row.preferences):row.preferences||{};
 const list=String(data.marketing_preferences||'').toLowerCase().split(/[,;]+/).map(v=>v.trim());
 return Object.fromEntries(channels.map(channel=>[channel,Object.prototype.hasOwnProperty.call(data,`marketing_${channel}`)?bool(data[`marketing_${channel}`]):list.includes(labels[channel].toLowerCase())])) as Choices;
}
// Resolve only records matching the destination in the recipient's unguessable link.
export async function preferenceRecords(c:PoolClient,permission:any) {
 const rows=(await c.query(`SELECT * FROM (
 SELECT 'landlord' AS kind,id,email,phone,json_build_object('marketing_email',marketing_email,'marketing_sms',marketing_sms,'marketing_phone',marketing_phone,'marketing_post',marketing_post) AS preferences FROM landlords
 UNION ALL SELECT 'landlord_bdm',id,email,phone,COALESCE(intake_data,'{}'::jsonb)::json FROM landlords_bdm
 UNION ALL SELECT 'tenant_enquiry',id,email_1,phone_1,json_build_object('marketing_preferences',marketing_preferences) FROM tenant_enquiries
 UNION ALL SELECT 'tenant',t.id,t.email,t.phone,json_build_object('marketing_preferences',e.marketing_preferences) FROM tenants t LEFT JOIN tenant_enquiries e ON e.id=t.source_enquiry_id
 ) contacts WHERE CASE WHEN $1='email' THEN lower(trim(email))=$2 ELSE regexp_replace(regexp_replace(phone,'[^0-9]','','g'),'^0','44')=regexp_replace($2,'[^0-9]','','g') END`,[permission.channel,permission.destination])).rows;
 const emails=[...new Set(rows.map(row=>String(row.email||'').trim().toLowerCase()).filter(Boolean))];
 const phones=[...new Set(rows.map(row=>row.phone?normalizeUkPhone(row.phone):'').filter(v=>/^\+\d{10,15}$/.test(v)))];
 const email=permission.channel==='email'?permission.destination:emails.length===1?emails[0]:null;
 const phone=permission.channel==='sms'?permission.destination:phones.length===1?phones[0]:null;
 const destinations={email,sms:phone,phone,post:email||phone};
 const choices=Object.fromEntries(channels.map(channel=>[channel,rows.length>0&&rows.every(row=>sourceChoices(row)[channel])])) as Choices;
 const available=Object.fromEntries(channels.map(channel=>[channel,!!destinations[channel]])) as Choices;
 for(const channel of channels) {
  if(!available[channel]){choices[channel]=false;continue;}
  const canonical=(await c.query('SELECT allowed FROM marketing_permissions WHERE channel=$1 AND destination=$2',[channel,destinations[channel]])).rows[0];
  if(canonical)choices[channel]=canonical.allowed;
 }
 return {rows,destinations,choices,available};
}
export async function savePreferenceRecords(c:PoolClient,permission:any,choices:Choices,onlyChannel?:Channel) {
 const resolved=await preferenceRecords(c,permission);
 for(const channel of onlyChannel?[onlyChannel]:channels) {
  if(!resolved.available[channel]){if(choices[channel])throw Error('No unique contact details are available for this communication method');continue;}
  const destination=resolved.destinations[channel];
  const old=(await c.query('SELECT allowed FROM marketing_permissions WHERE channel=$1 AND destination=$2 FOR UPDATE',[channel,destination])).rows[0];
  if(!old||old.allowed!==choices[channel]) {
   await c.query("INSERT INTO marketing_permissions(channel,destination,allowed,evidence,unsubscribe_token) VALUES($1,$2,$3,'Recipient updated communication preferences',$4) ON CONFLICT(channel,destination) DO UPDATE SET allowed=EXCLUDED.allowed,evidence=EXCLUDED.evidence,updated_at=NOW(),updated_by=NULL",[channel,destination,choices[channel],randomUUID()]);
   await c.query("INSERT INTO audit_log(action,entity_type,changes) VALUES('update','marketing_preferences',$1)",[JSON.stringify({channel,destination,allowed:choices[channel],source:'recipient preference link'})]);
  }
  if(!choices[channel]&&['email','sms'].includes(channel))await c.query("UPDATE marketing_recipients r SET status='skipped',error='Marketing permission withdrawn' FROM marketing_campaigns c WHERE r.campaign_id=c.id AND c.channel=$1 AND r.destination=$2 AND r.status='pending'",[channel,destination]);
 }
 // Keep the preference controls on the individual's CRM record in sync.
 for(const row of resolved.rows) {
  const merged={...sourceChoices(row),...Object.fromEntries((onlyChannel?[onlyChannel]:channels).filter(k=>resolved.available[k]).map(k=>[k,choices[k]]))} as Choices;
  const list=channels.filter(k=>merged[k]).map(k=>labels[k]).join(',');
  if(row.kind==='landlord')await c.query('UPDATE landlords SET marketing_email=$1,marketing_sms=$2,marketing_phone=$3,marketing_post=$4 WHERE id=$5',[+merged.email,+merged.sms,+merged.phone,+merged.post,row.id]);
  else if(row.kind==='tenant_enquiry')await c.query('UPDATE tenant_enquiries SET marketing_preferences=$1 WHERE id=$2',[list,row.id]);
  else if(row.kind==='tenant')await c.query('UPDATE tenant_enquiries SET marketing_preferences=$1 WHERE id=(SELECT source_enquiry_id FROM tenants WHERE id=$2)',[list,row.id]);
  else if(row.kind==='landlord_bdm')await c.query("UPDATE landlords_bdm SET intake_data=COALESCE(intake_data,'{}'::jsonb)||$1::jsonb WHERE id=$2",[JSON.stringify({...Object.fromEntries(channels.map(k=>[`marketing_${k}`,merged[k]])),marketing_preferences:list}),row.id]);
 }
 return {...resolved.choices,...choices};
}
