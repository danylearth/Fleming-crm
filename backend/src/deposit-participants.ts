type Participant={tenant_id?:number;enquiry_id?:number};
export async function resolveDepositParticipants(client:{query:(sql:string,values:unknown[])=>Promise<{rows:any[]}>},allocation:{participants?:unknown;tenant_id?:unknown}){
 const raw=allocation.participants===undefined&&allocation.tenant_id?[{tenant_id:allocation.tenant_id}]:allocation.participants;
 if(!Array.isArray(raw)||!raw.length||raw.length>20)throw Error('Choose between 1 and 20 tenants or enquiries');
 const seen=new Set<string>();const participants:Participant[]=[];let propertyId:number|null=null;
 for(const p of raw){
  if(!p||typeof p!=='object'||Boolean(p.tenant_id)===Boolean(p.enquiry_id))throw Error('Choose a tenant or enquiry for each participant');
  const tenant=Boolean(p.tenant_id),id=Number(tenant?p.tenant_id:p.enquiry_id),key=`${tenant?'tenant':'enquiry'}:${id}`;
  if(!Number.isInteger(id)||id<=0)throw Error('Choose an existing participant');
  if(seen.has(key))continue;seen.add(key);
  const row=(await client.query(tenant?'SELECT id,property_id FROM tenants WHERE id=$1':'SELECT id,linked_property_id AS property_id FROM tenant_enquiries WHERE id=$1',[id])).rows[0];
  if(!row?.property_id)throw Error('Every participant must have a linked property');
  if(propertyId!==null&&Number(row.property_id)!==propertyId)throw Error('Joint deposit participants must be linked to the same property');
  propertyId=Number(row.property_id);participants.push(tenant?{tenant_id:id}:{enquiry_id:id});
 }
 return {propertyId,tenantId:participants.find(p=>p.tenant_id)?.tenant_id||null,participants};
}

// Correlated to an allocation: adding people must never multiply the amount.
export const depositParticipantsSql=`COALESCE((SELECT json_agg(json_build_object('tenant_id',ap.tenant_id,'enquiry_id',ap.enquiry_id,'name',COALESCE(t.name,CONCAT_WS(' ',e.first_name_1,e.last_name_1))) ORDER BY ap.id) FROM bank_feed_allocation_participants ap LEFT JOIN tenants t ON t.id=ap.tenant_id LEFT JOIN tenant_enquiries e ON e.id=ap.enquiry_id WHERE ap.allocation_id=a.id),'[]'::json)`;
