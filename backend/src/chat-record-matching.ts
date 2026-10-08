import {query} from './db-pg';
export type ChatContact={entity_type:string;entity_id:number;name:string};
export function phoneMatchVariants(phone:string):string[] {
 let digits=String(phone||'').replace(/\D/g,'').replace(/^00/,'');
 if(digits.startsWith('440'))digits='44'+digits.slice(3);
 if(digits.startsWith('0'))digits='44'+digits.slice(1);
 if(!/^\d{10,15}$/.test(digits))return [];
 return digits.startsWith('44')?[digits,'0'+digits.slice(2),'00'+digits,'440'+digits.slice(2)]:[digits,'00'+digits];
}
export function uniqueChatContact(rows:ChatContact[]):ChatContact|null {
 const unique=new Map(rows.map(row=>[`${row.entity_type}:${row.entity_id}`,row]));
 return unique.size===1?[...unique.values()][0]:null;
}
export async function findChatContact(phone:string):Promise<ChatContact|null> {
 const variants=phoneMatchVariants(phone);if(!variants.length)return null;
 // Converted enquiries no longer compete with the current contact record. Legacy
 // second-applicant fields are searched only where there is no separate linked record.
 const rows=await query(`WITH contacts AS (
 SELECT 'tenant' AS entity_type,id AS entity_id,name,phone FROM tenants WHERE COALESCE(status,'active') NOT IN ('archived','inactive')
 UNION ALL SELECT 'tenant',id,name,phone_2 FROM tenants WHERE linked_tenant_id IS NULL AND COALESCE(status,'active') NOT IN ('archived','inactive')
 UNION ALL SELECT 'landlord',id,name,phone FROM landlords WHERE to_jsonb(landlords)->>'archived_at' IS NULL
 UNION ALL SELECT 'landlord',l.id,l.name,d.phone FROM directors d JOIN landlords l ON l.id=d.landlord_id WHERE COALESCE(d.archived,0)=0 AND to_jsonb(l)->>'archived_at' IS NULL
 UNION ALL SELECT 'tenant_enquiry',id,CONCAT_WS(' ',first_name_1,last_name_1),phone_1 FROM tenant_enquiries WHERE status NOT IN ('converted','rejected','closed','archived','not_interested')
 UNION ALL SELECT 'tenant_enquiry',id,CONCAT_WS(' ',first_name_2,last_name_2),phone_2 FROM tenant_enquiries WHERE joint_partner_id IS NULL AND status NOT IN ('converted','rejected','closed','archived','not_interested')
 UNION ALL SELECT 'landlord_bdm',id,name,phone FROM landlords_bdm WHERE status NOT IN ('onboarded','not_interested','rejected','closed')
 UNION ALL SELECT 'user',id,name,phone FROM users WHERE is_active=1
 UNION ALL SELECT 'user',id,name,trusted_phone FROM users WHERE is_active=1
 ) SELECT entity_type,entity_id,name FROM contacts WHERE regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=ANY($1::text[])`,[variants]);
 return uniqueChatContact(rows);
}
