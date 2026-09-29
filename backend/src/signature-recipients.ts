import {query} from './db-pg';
export type SigningRecipient={entity_type:'tenant'|'landlord';entity_id:number;recipient_slot:'primary'|'joint';name:string;email:string;key:string;record_type?:string};
export function recipientOptions(entity:'tenant'|'landlord', rows:any[]):SigningRecipient[]{
 const options:SigningRecipient[]=[];
 for(const row of rows){
  const add=(slot:'primary'|'joint',name:string,email:string)=>options.push({entity_type:entity,entity_id:Number(row.id),recipient_slot:slot,name,email:email||'',key:`${entity}:${row.id}:${slot}`,record_type:entity==='tenant'?'Tenant':row.entity_type==='company'?'Limited company':'Landlord'});
  add('primary',row.name,row.email);
  if(entity==='tenant'&&row.is_joint_tenancy&&!row.linked_tenant_id&&(row.first_name_2||row.last_name_2||row.email_2))add('joint',[row.first_name_2,row.last_name_2].filter(Boolean).join(' ')||'Joint Tenant',row.email_2);
 }
 return options;
}
export async function connectedSignatureRecipients(entity:'tenant'|'landlord',id:number):Promise<SigningRecipient[]>{
 const rows=entity==='tenant'?await query(`SELECT t.id,t.name,t.email,t.is_joint_tenancy,t.linked_tenant_id,t.first_name_2,t.last_name_2,t.email_2
 FROM tenants root JOIN tenants t ON t.id=root.id OR ((t.id=root.linked_tenant_id OR t.linked_tenant_id=root.id) AND t.property_id IS NOT DISTINCT FROM root.property_id AND t.tenancy_start_date IS NOT DISTINCT FROM root.tenancy_start_date)
 WHERE root.id=$1 ORDER BY (t.id=$1) DESC,t.name`,[id]):await query(`WITH owners AS (
 SELECT property_id,landlord_id FROM property_landlords UNION SELECT id,landlord_id FROM properties WHERE landlord_id IS NOT NULL
 ) SELECT l.id,l.name,l.email,l.entity_type FROM landlords l WHERE l.id=$1 OR EXISTS(
 SELECT 1 FROM owners own JOIN owners joint ON joint.property_id=own.property_id WHERE own.landlord_id=$1 AND joint.landlord_id=l.id
 ) ORDER BY (l.id=$1) DESC,l.name`,[id]);
 return recipientOptions(entity,rows);
}
export async function searchSignatureRecipients(search:string):Promise<SigningRecipient[]>{
 const text=search.trim().slice(0,100);
 if(text.length<2)return [];
 const pattern='%'+text.replace(/[\\%_]/g,'\\$&')+'%';
 const [tenants,landlords]=await Promise.all([
  query(`SELECT id,name,email,is_joint_tenancy,linked_tenant_id,first_name_2,last_name_2,email_2 FROM tenants WHERE concat_ws(' ',name,email,first_name_2,last_name_2,email_2) ILIKE $1 ORDER BY name,id LIMIT 20`,[pattern]),
  query(`SELECT id,name,email,entity_type FROM landlords WHERE concat_ws(' ',name,email) ILIKE $1 ORDER BY name,id LIMIT 20`,[pattern])
 ]);
 return [...recipientOptions('tenant',tenants),...recipientOptions('landlord',landlords)].filter(p=>(p.name+' '+p.email).toLowerCase().includes(text.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,20);
}
// Resolve explicitly selected CRM records on the server; never trust submitted names or emails.
export async function resolveSignatureRecipients(selected:any):Promise<SigningRecipient[]>{
 if(!Array.isArray(selected)||selected.length<1||selected.length>10)throw Error('Select between 1 and 10 recipients');
 for(const r of selected)if(!r||!['tenant','landlord'].includes(r.entity_type)||!Number.isInteger(r.entity_id)||r.entity_id<1||!['primary','joint'].includes(r.recipient_slot||'primary'))throw Error('Choose valid tenant or landlord records');
 const tenantIds=selected.filter(r=>r.entity_type==='tenant').map(r=>r.entity_id),landlordIds=selected.filter(r=>r.entity_type==='landlord').map(r=>r.entity_id);
 const [tenants,landlords]=await Promise.all([
  tenantIds.length?query('SELECT id,name,email,is_joint_tenancy,linked_tenant_id,first_name_2,last_name_2,email_2 FROM tenants WHERE id=ANY($1::int[])',[tenantIds]):Promise.resolve([]),
  landlordIds.length?query('SELECT id,name,email,entity_type FROM landlords WHERE id=ANY($1::int[])',[landlordIds]):Promise.resolve([])
 ]);
 return selectSignatureRecipients(selected,[...recipientOptions('tenant',tenants),...recipientOptions('landlord',landlords)]);
}
export function selectSignatureRecipients(selected:any,allowed:SigningRecipient[]):SigningRecipient[]{
 if(!Array.isArray(selected)||selected.length<1||selected.length>10)throw Error('Select between 1 and 10 recipients');
 const seen=new Set<string>();
 return selected.map(r=>{
  const person=allowed.find(p=>p.entity_type===r.entity_type&&p.entity_id===r.entity_id&&p.recipient_slot===(r.recipient_slot||'primary'));
  if(!person)throw Error('Selected recipient record is unavailable');
  if(seen.has(person.key))throw Error('Recipient selected twice');seen.add(person.key);
  if(!/^\S+@\S+\.\S+$/.test(person.email))throw Error('Each recipient needs an email address on their record');
  return person;
 });
}
