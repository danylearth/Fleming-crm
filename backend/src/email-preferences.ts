import crypto from 'crypto';
import {queryOne} from './db-pg';
export async function emailPreferencesUrl(email:string):Promise<string>{
 const destination=email.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination))throw Error('Invalid email recipient');
 // Creating a preference link never grants marketing consent or overrides an opt-out.
 const row=await queryOne(`INSERT INTO marketing_permissions(channel,destination,allowed,evidence,unsubscribe_token)
 VALUES('email',$1,FALSE,'Preferences link created for an outbound email; no marketing consent granted',$2)
 ON CONFLICT(channel,destination) DO UPDATE SET destination=EXCLUDED.destination RETURNING unsubscribe_token`,[destination,crypto.randomUUID()]);
 if(!row?.unsubscribe_token)throw Error('Could not create recipient email preferences link');
 return `${(process.env.BASE_URL||'https://fleming-crm-api.fly.dev').replace(/\/$/,'')}/api/public/marketing/unsubscribe/${row.unsubscribe_token}`;
}
