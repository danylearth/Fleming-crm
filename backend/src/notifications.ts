import type {Express} from 'express';
import {authMiddleware,type AuthRequest} from './auth';
import {query,run} from './db-pg';

export interface CrmNotification {
  key:string;kind:'task'|'reminder'|'activity';title:string;detail:string;href:string;
  workflow:'internal'|'external'|'general';date:string;priority:string;canDismiss:boolean;lastUser?:string;category?:'landlord'|'tenant';
}
const reminderTypes=new Set(['eicr_reminder','epc_reminder','gas_reminder','insurance_renewal','tenancy_end','rent_review','inventory_due','property_inspection']);
const certificateTypes:Record<string,{field:string;document:string}>={eicr_reminder:{field:'eicr_expiry_date',document:'EICR'},epc_reminder:{field:'epc_expiry_date',document:'EPC'},gas_reminder:{field:'gas_safety_expiry_date',document:'Gas Safety Certificate'}};
const guarantorNotificationActions=['guarantor_application_submitted','guarantor_deed_witnessed','guarantor_corrections_resubmitted','guarantor_witness_declined'];
const day=(value:any)=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
export function notificationTaskResolved(row:any,today:string):boolean {
  if(!['pending','in_progress'].includes(row.status))return true;
  if(row.entity_type==='tenant_enquiry'&&row.task_type==='follow_up'&&String(row.title||'').startsWith('Holding deposit follow-up:')&&[true,1,'1'].includes(row.entity_data?.holding_deposit_received))return true;
  const certificate=certificateTypes[row.task_type];
  if(certificate){
    if(row.task_type==='gas_reminder'&&!row.property_data?.has_gas)return true;
    const expiry=day(row.property_data?.[certificate.field]);
    return Boolean(expiry&&expiry>day(row.due_date)&&expiry>=today&&row.renewal_document);
  }
  const cycleField=row.task_type==='tenancy_end'?'tenancy_end_date':row.task_type==='rent_review'?'rent_review_date':null;
  if(cycleField){const current=day(row.property_data?.[cycleField]);if(current&&current>day(row.due_date))return true;}
  return Boolean(row.resolved);
}
export function notificationForTask(row:any,today:string):CrmNotification|null {
  if(notificationTaskResolved(row,today))return null;
  const reminder=reminderTypes.has(row.task_type);
  if(!reminder&&(!row.due_date||day(row.due_date)>today))return null;
  return {key:`task:${row.id}:${day(row.due_date)}`,kind:reminder?'reminder':'task',title:row.title,lastUser:row.last_user,detail:row.label||'General task',href:`/tasks/${row.id}`,workflow:row.workflow||'general',date:day(row.due_date),priority:row.priority||'medium',canDismiss:true};
}

// Resolve portfolio ownership using saved relationships, as on the dashboard.
const entitiesSql=`WITH property_context AS (
 SELECT p.id,p.landlord_id,p.address,l.landlord_type,to_jsonb(p) AS data FROM properties p LEFT JOIN landlords l ON l.id=p.landlord_id WHERE p.archived_at IS NULL
), entities AS (
 SELECT 'property'::text AS type,id,address AS label,'/properties/'||id AS href,id AS property_id,landlord_id,NULL::integer AS tenant_id,landlord_type AS workflow,data FROM property_context
 UNION ALL SELECT 'tenant',t.id,t.name,'/tenants/'||t.id,p.id,p.landlord_id,t.id,p.landlord_type,to_jsonb(t) FROM tenants t LEFT JOIN property_context p ON p.id=t.property_id WHERE COALESCE(t.status,'active')<>'inactive'
 UNION ALL SELECT 'tenant_enquiry',e.id,CONCAT_WS(' ',e.first_name_1,e.last_name_1),'/enquiries/'||e.id,p.id,p.landlord_id,NULL,p.landlord_type,to_jsonb(e) FROM tenant_enquiries e LEFT JOIN property_context p ON p.id=e.linked_property_id WHERE e.status NOT IN ('converted','rejected','closed')
 UNION ALL SELECT 'landlord',l.id,l.name,'/landlords/'||l.id,NULL,l.id,NULL,l.landlord_type,to_jsonb(l) FROM landlords l WHERE to_jsonb(l)->>'archived_at' IS NULL
 UNION ALL SELECT 'landlord_bdm',b.id,b.name,'/landlord-enquiries/'||b.id,NULL,NULL,NULL,'external',to_jsonb(b) FROM landlords_bdm b WHERE b.status NOT IN ('onboarded','not_interested','rejected','closed')
 UNION ALL SELECT 'maintenance',m.id,m.description,'/maintenance/'||m.id,p.id,p.landlord_id,m.tenant_id,p.landlord_type,to_jsonb(m) FROM maintenance m JOIN property_context p ON p.id=m.property_id WHERE m.status NOT IN ('completed','closed')
 UNION ALL SELECT 'inventory',i.id,p.address,'/properties/'||p.id,p.id,p.landlord_id,i.tenant_id,p.landlord_type,to_jsonb(i) FROM inventories i JOIN property_context p ON p.id=i.property_id
)`;
const related=`((a.entity_type=e.type AND a.entity_id=e.id) OR (a.entity_type='property' AND a.entity_id=e.property_id) OR (a.entity_type='landlord' AND a.entity_id=e.landlord_id) OR (a.entity_type='tenant' AND a.entity_id=e.tenant_id))`;
const assignment=`(LOWER(COALESCE(e.data->>'assigned_to',e.data->>'assigned_user_id',e.data->>'handover_assigned_to',''))=ANY($2::text[]) OR EXISTS(SELECT 1 FROM tasks assigned WHERE assigned.status IN ('pending','in_progress') AND LOWER(COALESCE(assigned.assigned_to,''))=ANY($2::text[]) AND ((assigned.entity_type=e.type AND assigned.entity_id=e.id) OR (assigned.entity_type='property' AND assigned.entity_id=e.property_id) OR (assigned.entity_type='tenant' AND assigned.entity_id=e.tenant_id) OR (assigned.entity_type='landlord' AND assigned.entity_id=e.landlord_id))))`;

export const notificationTasksSql=entitiesSql+`
 SELECT t.*,e.label,e.workflow,p.data AS property_data,e.data AS entity_data,(SELECT name FROM users WHERE id=owner.user_id) AS last_user,
 EXISTS(SELECT 1 FROM documents d WHERE d.entity_type='property' AND d.entity_id=e.property_id AND d.doc_type=CASE t.task_type WHEN 'eicr_reminder' THEN 'EICR' WHEN 'epc_reminder' THEN 'EPC' WHEN 'gas_reminder' THEN 'Gas Safety Certificate' END AND COALESCE(d.review_status,'approved')='approved' AND d.uploaded_at>=t.created_at) AS renewal_document,
 CASE WHEN t.task_type='insurance_renewal' THEN NOT EXISTS(SELECT 1 FROM property_policies pol JOIN property_policy_allocations pa ON pa.policy_id=pol.id WHERE pa.property_id=e.property_id AND pol.expiry_date<=((NOW() AT TIME ZONE 'Europe/London')::date+14) AND NOT EXISTS(SELECT 1 FROM property_policies newer JOIN property_policy_allocations na ON na.policy_id=newer.id WHERE na.property_id=e.property_id AND newer.policy_type=pol.policy_type AND newer.expiry_date>pol.expiry_date AND newer.commencement_date<=pol.expiry_date+1)) ELSE false END AS resolved
 FROM tasks t LEFT JOIN entities e ON e.type=t.entity_type AND e.id=t.entity_id LEFT JOIN property_context p ON p.id=e.property_id
 LEFT JOIN LATERAL(SELECT a.user_id FROM audit_log a WHERE a.user_id IS NOT NULL AND ${related} ORDER BY (a.entity_type=e.type AND a.entity_id=e.id) DESC,a.created_at DESC,a.id DESC LIMIT 1) owner ON TRUE
 WHERE t.status IN ('pending','in_progress') AND (e.id IS NOT NULL OR t.entity_type IS NULL OR t.entity_type='general')
 AND (LOWER(COALESCE(t.assigned_to,''))=ANY($2::text[]) OR (NULLIF(t.assigned_to,'') IS NULL AND t.task_type=ANY($4::text[]) AND (${assignment} OR owner.user_id=$1 OR $3='admin')))
 ORDER BY t.due_date NULLS LAST,t.id`;

export const notificationEventsSql=entitiesSql+`
 SELECT event.id,event.action,event.changes,event.created_at,e.label,e.href,e.workflow,
 (SELECT name FROM users WHERE id=owner.user_id) AS last_user,p.address AS property_address,
 jsonb_build_object('status',agreement.status,'requires_landlord_signature',agreement.requires_landlord_signature,'landlord_signed_at',agreement.landlord_signed_at,'tenant_signed_at',agreement.tenant_signed_at,'joint_tenant_signed_at',agreement.joint_tenant_signed_at,'requires_joint_tenant_signature',agreement.requires_joint_tenant_signature,'landlord_signature_name',agreement.landlord_signature_name,'tenant_signature_name',agreement.tenant_signature_name,'joint_tenant_signature_name',agreement.joint_tenant_signature_name) AS signing,
 e.data->>'application_review_status' AS review_status,
 CASE WHEN e.type='tenant_enquiry' THEN e.data END AS application,
 to_jsonb(partner) AS partner_application,
 jsonb_build_object('name',COALESCE(guarantor.form->>'name',guarantor.name),'status',guarantor.status,'workflow',guarantor.workflow,'execution_id',guarantor.execution_id,'required',e.data->'guarantor_required') AS guarantor,
 CASE WHEN event.action='document_upload' THEN (SELECT d.review_status FROM documents d WHERE d.id=(event.changes::jsonb->>'document_id')::integer) END AS document_status
 FROM audit_log event JOIN entities e ON e.type=event.entity_type AND e.id=event.entity_id
 LEFT JOIN property_context p ON p.id=e.property_id
 LEFT JOIN tenancy_agreements agreement ON event.changes::jsonb->>'action'='tenancy_agreement_signed' AND agreement.id::text=event.changes::jsonb->>'agreement_id'
 LEFT JOIN tenant_enquiries partner ON e.type='tenant_enquiry' AND partner.id=(e.data->>'joint_partner_id')::integer
 LEFT JOIN guarantor_verifications guarantor ON e.type='tenant_enquiry' AND guarantor.enquiry_id=e.id
 LEFT JOIN LATERAL(SELECT a.user_id FROM audit_log a WHERE a.user_id IS NOT NULL AND ${related} AND (a.created_at,a.id)<(event.created_at,event.id) ORDER BY (a.entity_type=e.type AND a.entity_id=e.id) DESC,a.created_at DESC,a.id DESC LIMIT 1) owner ON TRUE
 WHERE event.user_id IS NULL AND (
  event.changes::jsonb->>'action' IN ('application_form_completed','application_form_revised','tenancy_agreement_signed')
  OR event.action IN ('document_signed','service_agreement_signed',${guarantorNotificationActions.map(action=>"'"+action+"'").join(',')})
  OR (event.action='signed' AND event.entity_type='inventory')
  OR (event.action='document_upload' AND event.user_email IN ('tenant-self-service','landlord-self-service'))
  OR event.changes::jsonb->>'source'='public_tenant_report'
 ) AND (owner.user_id=$1 OR ${assignment})
 AND NOT EXISTS(SELECT 1 FROM audit_log handled WHERE handled.entity_type=event.entity_type AND handled.entity_id=event.entity_id AND handled.user_id IS NOT NULL AND (handled.created_at,handled.id)>(event.created_at,event.id) AND handled.action IN ('update','status_changed','application_review','application_section_review','document_review','document_upload','archive','delete'))
 AND (event.action NOT IN (${guarantorNotificationActions.map(action=>"'"+action+"'").join(',')}) OR NOT EXISTS(SELECT 1 FROM audit_log newer WHERE newer.entity_type=event.entity_type AND newer.entity_id=event.entity_id AND newer.action IN (${guarantorNotificationActions.map(action=>"'"+action+"'").join(',')}) AND (newer.created_at,newer.id)>(event.created_at,event.id)))
 ORDER BY event.created_at DESC,event.id DESC`;

// Group before applying dismissals, so clearing a joint notification cannot expose an older one.
export function notificationsForEvents(rows:any[]):CrmNotification[] {
 const groups=new Map<string,any>();const other:CrmNotification[]=[];
 for(const row of rows){
  const changes=typeof row.changes==='string'?JSON.parse(row.changes||'{}'):row.changes||{};
  const action=changes.action||row.action;
  const application=row.application;
  if(!application||!['application_form_completed','application_form_revised','document_upload'].includes(action)){
   const item=notificationForEvent(row);if(item)other.push(item);continue;
  }
  const partner=row.partner_application;
  const waiting=(record:any)=>!record?.application_form_completed||(record.application_review_status==='changes_requested'&&record.application_changes_sent_at);
  if(waiting(application)||(application.joint_partner_id&&waiting(partner)))continue;
  if(application.application_review_status==='approved')continue;
  if(action==='document_upload'&&['approved','rejected'].includes(row.document_status))continue;
  const key=String(Math.min(application.id,partner?.id||application.id));
  const previous=groups.get(key);
  if(!previous||Date.parse(row.created_at)>Date.parse(previous.created_at)||(Date.parse(row.created_at)===Date.parse(previous.created_at)&&row.id>previous.id))groups.set(key,row);
 }
 for(const row of groups.values()){
  const records=[row.application,...(row.partner_application?[row.partner_application]:[])].sort((a,b)=>a.id-b.id);
  const item=notificationForEvent({...row,review_status:'pending'});if(!item)continue;
  other.push({...item,title:records.length>1?'Joint application ready for review':'Tenant application ready for review',detail:records.map(r=>[r.first_name_1,r.last_name_1].filter(Boolean).join(' ')).join(' & '),href:`/enquiries/${row.application.id}?onboarding=1`});
 }
 return other;
}

export function notificationForEvent(row:any):CrmNotification|null {
 const changes=typeof row.changes==='string'?JSON.parse(row.changes||'{}'):row.changes||{};
 const action=changes.action||row.action;
 if(['application_form_completed','application_form_revised'].includes(action)&&row.review_status==='approved')return null;
 if(row.action==='document_upload'&&['approved','rejected'].includes(row.document_status))return null;
 if(guarantorNotificationActions.includes(action)){
  const g=row.guarantor,workflow=g?.workflow||{};
  if(!g||g.required!==true||!['awaiting_witness','submitted','witness_declined'].includes(g.status)||workflow.reviewStatus==='approved'||workflow.deedNeedsResigning)return null;
  if(changes.execution_id&&Number(changes.execution_id)!==Number(g.execution_id))return null;
  if(action==='guarantor_witness_declined'&&g.status!=='witness_declined')return null;
  if(action==='guarantor_application_submitted'&&g.status!=='awaiting_witness')return null;
  if(['guarantor_deed_witnessed','guarantor_corrections_resubmitted'].includes(action)&&g.status!=='submitted')return null;
  const title=g.status==='witness_declined'?'Guarantor witness declined':g.status==='awaiting_witness'?'Guarantor signed — waiting for witness':action==='guarantor_corrections_resubmitted'?'Guarantor corrections ready for review':'Guarantor application ready for review';
  return {key:'activity:'+row.id,kind:'activity',title,detail:[g.name,row.label].filter(Boolean).join(' · '),href:row.href+'?onboarding=1',workflow:row.workflow||'general',date:day(row.created_at),priority:g.status==='witness_declined'?'high':'medium',canDismiss:true,lastUser:row.last_user,category:'tenant'};
 }
 if(action==='tenancy_agreement_signed'){

  const signing=row.signing||{},role=changes.role==='landlord'?'landlord':changes.role==='joint_tenant'?'joint_tenant':'tenant';
  const name=changes.signer_name||signing[role+'_signature_name']||(role==='landlord'?'The landlord':row.label||'The tenant');
  const waiting=signing.status==='completed'?'APT completed.':signing.requires_landlord_signature&&!signing.landlord_signed_at?'Currently waiting on the landlord to complete.':!signing.tenant_signed_at||(signing.requires_joint_tenant_signature&&!signing.joint_tenant_signed_at)?'Currently waiting on the tenants to complete.':'';
  return {key:'activity:'+row.id,kind:'activity',title:name+' has signed their APT'+(row.property_address?' for '+row.property_address:'')+'.'+(waiting?' '+waiting:''),detail:'',href:row.href,workflow:row.workflow||'general',date:day(row.created_at),priority:'medium',canDismiss:true,lastUser:row.last_user,category:role==='landlord'?'landlord':'tenant'};
 }
 const titles:Record<string,string>={application_form_completed:'Tenant application completed',application_form_revised:'Tenant application updated',tenancy_agreement_signed:changes.role==='landlord'?'Landlord signed the APT':'Tenant signed the APT',document_signed:'Document signed',service_agreement_signed:'Landlord signed the service contract',signed:'Tenant completed the inventory',document_upload:'New documents uploaded'};
 return {key:`activity:${row.id}`,kind:'activity',title:changes.source==='public_tenant_report'?'Tenant reported maintenance':titles[action]||'Record action completed',detail:row.label,lastUser:row.last_user,href:row.href,workflow:row.workflow||'general',date:day(row.created_at),priority:'medium',canDismiss:true};
}
export const notificationFailuresSql=entitiesSql+`
 SELECT m.*,e.label,e.href,e.workflow,u.name AS last_user FROM (
 SELECT 'email' AS channel,id,entity_type,entity_id,to_email AS recipient,status,error_message,created_at,sent_by,sent_by_email FROM email_messages WHERE status IN ('failed','bounced')
 UNION ALL SELECT 'sms',id,COALESCE(entity_type,CASE WHEN enquiry_id IS NOT NULL THEN 'tenant_enquiry' END),COALESCE(entity_id,enquiry_id),to_phone,status,error_message,created_at,sent_by,sent_by_email FROM sms_messages WHERE status IN ('failed','undelivered') AND COALESCE(direction,'outbound')<>'inbound'
 ) m LEFT JOIN entities e ON e.type=m.entity_type AND e.id=m.entity_id LEFT JOIN users u ON u.id=m.sent_by
 WHERE (m.sent_by=$1 OR LOWER(COALESCE(m.sent_by_email,''))=ANY($2::text[]) OR $3='admin' OR ${assignment})
 AND NOT EXISTS(SELECT 1 FROM tenant_enquiries converted WHERE m.entity_type='tenant_enquiry' AND converted.id=m.entity_id AND converted.status='converted')
 ORDER BY m.created_at DESC,m.id DESC`;
export function notificationForFailure(row:any):CrmNotification {
 const channel=row.channel==='sms'?'SMS':'Email';
 const routes:Record<string,string>={tenant:'/tenants/',tenant_enquiry:'/enquiries/',landlord:'/landlords/',landlord_bdm:'/landlord-enquiries/',property:'/properties/',maintenance:'/maintenance/'};
 const reason=/30008/.test(row.error_message||'')?'The mobile network reported an unspecified delivery failure.':row.error_message||'The message could not be delivered.';
 return {key:`delivery:${row.channel}:${row.id}`,kind:'activity',title:channel+' '+(row.status==='bounced'?'bounced':'not delivered'),detail:[row.label,row.recipient,reason,'Check the '+(row.channel==='sms'?'mobile number':'email address')+' and retry from Communications.'].filter(Boolean).join(' · '),href:row.href||(routes[row.entity_type]&&row.entity_id?routes[row.entity_type]+row.entity_id:'/dashboard'),workflow:row.workflow||'general',date:day(row.created_at),priority:'high',canDismiss:true,lastUser:row.last_user};
}
export async function userNotifications(user:{id:number;name:string;email:string;role:string}) {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());
 const identities=[String(user.id),user.name.toLowerCase(),user.email.toLowerCase()];
  const [tasks,events,dismissed,failures]=await Promise.all([query(notificationTasksSql,[user.id,identities,user.role,[...reminderTypes]]),query(notificationEventsSql,[user.id,identities]),query('SELECT notification_key FROM notification_dismissals WHERE user_id=$1',[user.id]),query(notificationFailuresSql,[user.id,identities,user.role])]);
 const hidden=new Set(dismissed.map(row=>row.notification_key));
 return [...failures.map(notificationForFailure),...notificationsForEvents(events),...tasks.map(row=>notificationForTask(row,today))].filter((row):row is CrmNotification=>row!==null&&!hidden.has(row.key)).map(row=>({...row,canDismiss:true})).sort((a,b)=>b.date.localeCompare(a.date));
}
export function registerNotifications(app:Express) {
 app.get('/api/notifications',authMiddleware,async(req:AuthRequest,res)=>{res.setHeader('Cache-Control','no-store');res.json({items:await userNotifications(req.user),checkedAt:new Date().toISOString()});});
 app.post('/api/notifications/dismiss',authMiddleware,async(req:AuthRequest,res)=>{
  const key=String(req.body.key||'');if(!/^(delivery:(?:email|sms):\d+|activity:\d+|task:\d+:(?:\d{4}-\d{2}-\d{2})?)$/.test(key))return res.status(400).json({error:'Choose a notification to clear.'});
  if(!(await userNotifications(req.user)).some(n=>n.key===key&&n.canDismiss))return res.status(404).json({error:'This notification is no longer available.'});
  await run('INSERT INTO notification_dismissals(user_id,notification_key) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,key]);res.json({success:true});
 });
 app.post('/api/notifications/clear',authMiddleware,async(req:AuthRequest,res)=>{
  const keys=(await userNotifications(req.user)).map(n=>n.key);
  if(keys.length)await run('INSERT INTO notification_dismissals(user_id,notification_key) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[req.user.id,keys]);
  res.json({success:true,cleared:keys.length});
 });
}
