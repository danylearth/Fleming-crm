import type {PoolClient} from 'pg';
import {clientAgreementContext} from './client-agreement-details';
import path from 'node:path';
import {openGuarantorToken} from './guarantor-execution-rules';
import {guarantorReviewRecord} from './guarantor-review-record';
import {publicGuarantorState} from './guarantor-public-state';
export const formRules=()=>require(path.join(__dirname,'public-pages/guarantor/public-flow.mjs'));
export const employmentRules=()=>require(path.join(__dirname,'public-pages/guarantor/employment.mjs'));
export const guarantorApplicationUrl=(token:string)=>'https://apply.fleminglettings.co.uk/guarantor/#'+token;

export async function guarantorFiles(client:PoolClient,id:number){return (await client.query('SELECT id,category,original_name,mime_type,size,review_status,review_notes,uploaded_at FROM guarantor_verification_files WHERE verification_id=$1 AND current=TRUE ORDER BY id',[id])).rows;}
async function loadGuarantorState(client:PoolClient,row:any,enquiry:any,office=false){
 const {categories}=formRules(),files=row?await guarantorFiles(client,row.id):[],workflow=row?.workflow||{};
 const execution=row?.execution_id?(await client.query('SELECT id,status,source_sha256,form_snapshot,tenancy_snapshot,guarantor_signature,witness_signature,completed_at FROM guarantor_executions WHERE id=$1',[row.execution_id])).rows[0]:null;
 const contact={name:row?.name||enquiry.app_guarantor_name||'',email:row?.email||enquiry.app_guarantor_email||'',phone:row?.phone||enquiry.app_guarantor_phone||''};
 const uploads:any={},documentReviews:any={};
 categories.forEach((item:any,index:number)=>{const file=files.find(file=>file.category===item[1]);if(file){uploads[index]={key:String(file.id),name:file.original_name,type:file.mime_type,size:file.size,at:file.uploaded_at};documentReviews[900100+index]={status:file.review_status,notes:file.review_notes};}});
 const signature=execution?.guarantor_signature,witness=execution?.witness_signature;
 const g={required:enquiry.guarantor_required,status:row?.status==='submitted'?'office_review':row?.status||'draft',contact,form:row?.form||{},uploads,docs:categories.filter((_:any,index:number)=>uploads[index]).map((item:any)=>item[0]),
  signed:signature?{name:signature.name,at:signature.signed_at,version:signature.consent_snapshot?.version}:null,witnessed:witness?{name:witness.name,at:witness.signed_at}:null,
  signatureImage:signature?'data:image/png;base64,'+signature.signature:null,witnessSignatureImage:witness?'data:image/png;base64,'+witness.signature:null,
  submittedAt:row?.submitted_at,introAcceptedAt:workflow.introAcceptedAt,revisionEdits:workflow.revisionEdits||[],revisionUploads:workflow.revisionUploads||[],deedNeedsResigning:!!workflow.deedNeedsResigning,
  openedAt:workflow.openedAt,witnessOpenedAt:workflow.witnessOpenedAt,reason:workflow.reason,events:workflow.events||[],invitationDelivery:workflow.invitationDelivery,lastResent:workflow.lastResent};
 const data={reviews:workflow.sections||{},reviewStatus:workflow.reviewStatus||'pending',documentReviews,changes:workflow.changes,changesSent:workflow.changesSent,changesDelivery:workflow.changesDelivery,guarantorCredit:workflow.credit||{},notes:workflow.notes||[]};
 const applicationUrl=office&&row?.token_encrypted?guarantorApplicationUrl(openGuarantorToken(row.token_encrypted)):'';
 const witnessToken=office&&execution?.id?(await client.query('SELECT witness_token_encrypted FROM guarantor_executions WHERE id=$1',[execution.id])).rows[0]?.witness_token_encrypted:null;
 const witnessUrl=witnessToken?guarantorApplicationUrl('witness-'+openGuarantorToken(witnessToken)):'';
 const messages=row?.execution_id?(await client.query('SELECT kind,status,sent_at,created_at,last_error FROM guarantor_execution_emails WHERE execution_id=$1',[row.execution_id])).rows:[];
 const witnessMessage=messages.find(message=>message.kind==='witness_request'),completion=messages.find(message=>message.kind==='completed_deed');
 const tenants=[enquiry,...enquiry.joint_partner_id?(await client.query('SELECT first_name_1,last_name_1 FROM tenant_enquiries WHERE id=$1',[enquiry.joint_partner_id])).rows:[]];
 const landlordContext=office&&!execution?await clientAgreementContext(enquiry.id):null;
 const tenancy=execution?.tenancy_snapshot||{tenantNames:tenants.map(person=>[person.first_name_1,person.last_name_1].filter(Boolean).join(' ')),propertyAddress:[enquiry.property_address,enquiry.property_postcode].filter(Boolean).join(', '),startDate:enquiry.app_form_data?.tenancy_start_date||'',monthlyRent:Number(enquiry.monthly_rent_agreed||0),deposit:Number(enquiry.security_deposit_amount||0)};
 const state={...g,g,data,executionId:execution?.id,sourceHash:execution?.source_sha256,record:guarantorReviewRecord(g,data,row?.id||0,applicationUrl),
  documents:files.map(file=>({...file,entity_type:'guarantor',entity_id:row?.id,doc_type:file.category})),applicationUrl,witnessUrl,
  witnessInvitationDelivery:witnessMessage?{email:true,sms:false,at:witnessMessage.sent_at||witnessMessage.created_at,status:witnessMessage.status,error:witnessMessage.last_error}:null,
  completionEmail:completion?{status:completion.status,at:completion.sent_at||completion.created_at,error:completion.last_error}:null,
  tenancy:{...tenancy,...(landlordContext?.enabled?{landlord:landlordContext.details.landlordName,clientLandlord:true}:{}),tenants:tenancy.tenantNames.join(' and '),property:tenancy.propertyAddress,propertyCity:enquiry.property_city,propertyPostcode:enquiry.property_postcode,rent:Number(tenancy.monthlyRent).toLocaleString('en-GB',{style:'currency',currency:'GBP'})}};
 return state;
}

export function guarantorState(client:PoolClient,row:any,enquiry:any,office:true):ReturnType<typeof loadGuarantorState>;
export function guarantorState(client:PoolClient,row:any,enquiry:any,office?:false):Promise<ReturnType<typeof publicGuarantorState>>;
export async function guarantorState(client:PoolClient,row:any,enquiry:any,office=false){
 const state=await loadGuarantorState(client,row,enquiry,office);
 return office?state:publicGuarantorState(state);
}

export function saveGuarantorForm(row:any,values:any,introAccepted=false){
 const {groups,groupEditable,validateGroup}=formRules(),{fieldsFor}=employmentRules();
 if(!values||typeof values!=='object'||Array.isArray(values)||JSON.stringify(values).length>30000)throw Error('Enter valid application details');
 if(!['invited','changes_requested'].includes(row.status))throw Error('This application is locked');
 if(row.signature&&!row.workflow?.changesSent)throw Error('Wait for the office to send the requested corrections before editing');
 const workflow={...(row.workflow||{})},data={reviews:workflow.sections||{},reviewStatus:workflow.reviewStatus},g={form:row.form||{},signed:row.signature};
 const next={...g.form},resolved={...next,...values},handled=new Set<string>();
 for(const group of groups){
  const active=fieldsFor(group,resolved),previous=fieldsFor(group,next),keys=new Set<string>([...active,...previous].map((field:any)=>field[0]));
  const changed=[...keys].filter(key=>key in values&&String(values[key]??'')!==String(next[key]??''));
  if(changed.length&&!groupEditable(g,data,group.title))throw Error('Only the requested application sections can be changed');
  if(!groupEditable(g,data,group.title)){for(const key of keys)handled.add(key);continue;}
  for(const key of keys){handled.add(key);if(!active.some((field:any)=>field[0]===key)){delete next[key];continue;}if(key in values){if(!['string','boolean','number'].includes(typeof values[key])||String(values[key]).length>2000)throw Error('An application field is invalid or too long');next[key]=typeof values[key]==='boolean'?values[key]:String(values[key]).trim();}}
  if(row.signature&&changed.length){validateGroup(group.title,next);workflow.revisionEdits=[...new Set([...(workflow.revisionEdits||[]),group.title])];if(changed.some(key=>['name','addressLine1','addressCity','addressPostcode'].includes(key)))workflow.deedNeedsResigning=true;}
 }
 const witnessKeys=['witnessName','witnessEmail','witnessPhone','witnessAddressLine1','witnessAddressCity','witnessAddressPostcode','witnessEligible','witnessContactAgreed','witnessContactAuthority','present','consent','accurate'];
 for(const key of witnessKeys){handled.add(key);if(!(key in values))continue;if(row.signature&&String(values[key]??'')!==String(next[key]??''))throw Error('Signed witness details and declarations are locked');if(['witnessEligible','witnessContactAgreed','witnessContactAuthority','present','consent','accurate'].includes(key)&&typeof values[key]!=='boolean')throw Error('Declarations must be confirmed explicitly');if(String(values[key]).length>500)throw Error('Witness details are too long');next[key]=typeof values[key]==='boolean'?values[key]:String(values[key]).trim();}
 // These are derived from address fields, never trusted independently.
 handled.add('address');handled.add('witnessAddress');
 if(Object.keys(values).some(key=>!handled.has(key)))throw Error('The application contains unsupported fields');
 next.address=[next.addressLine1,next.addressCity,next.addressPostcode].filter(Boolean).join(', ');next.witnessAddress=[next.witnessAddressLine1,next.witnessAddressCity,next.witnessAddressPostcode].filter(Boolean).join(', ');
 if(introAccepted&&!row.signature&&!workflow.introAcceptedAt)workflow.introAcceptedAt=new Date().toISOString();
 return {form:next,workflow};
}
