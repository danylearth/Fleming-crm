import {emailContext} from './emails.mjs';
import {randomUUID} from 'node:crypto';
export const categories=['Primary ID','Secondary ID','Bank statements'];
const copy=x=>structuredClone(x);
const fields=['name','email','phone','address','city','postcode','dob','relationship','addressSince','previousAddress','employment','employer','income'];
const fail=m=>{throw new Error(m)};
export function newGuarantor(id,tenantId,data,source){return {id,tenantId,source,status:'nominated',details:{...Object.fromEntries(fields.map(k=>[k,''])),...data},revision:0,documents:[],credit:{status:'not_started'},agreement:{status:'not_issued'},history:[],invitation:null};}
export function initialState(){const g=newGuarantor('g1','83',{name:'Robin Taylor',email:'robin.taylor@example.test',phone:'07700900321',relationship:'Parent'},'Tenant application');return {version:1,property:{id:'demo-26',address:'24 Example Gardens',city:'Wolverhampton',postcode:'WV10 9TG',rent:1000,landlord:'Alex Morgan'},tenants:[{id:'83',name:'Jamie Taylor',guarantorRequired:null},{id:'84',name:'Casey Taylor',guarantorRequired:false}],guarantors:[g],enquiryRecords:{'83':copy(g.details)},tenantRecords:{'83':copy(g.details)},notifications:[],emails:[],audit:[{at:new Date().toISOString(),actor:'Jamie Taylor',action:'Guarantor nominated in tenant application',detail:'Robin Taylor · linked to Jamie only',source:'Tenant application'}]};}
function log(s,actor,action,detail='',source='Office'){s.audit.unshift({at:new Date().toISOString(),actor,action,detail,source});}
function queueEmail(s,g,kind,actor){const key=kind==='complete'?g.id+':complete:'+g.revision:randomUUID();s.emails??=[];if(s.emails.some(m=>m.key===key))return;s.emails.unshift({id:randomUUID(),key,kind,direction:'outbound',recipientType:'guarantor',label:'Email to Guarantor',status:'Test only — not sent',at:new Date().toISOString(),actor,context:emailContext(s,g),linkedApplicantIds:s.tenants.map(t=>t.id)});log(s,actor,'Guarantor '+kind+' email prepared','Email to Guarantor · '+g.details.email,'Test email outbox');}
function notify(s,text,g){s.notifications.unshift({id:randomUUID(),at:new Date().toISOString(),text,g:g.id,read:false});}
export function checkLink(g,token){if(!g?.invitation||g.invitation.token!==token||g.invitation.revoked||Date.parse(g.invitation.expires)<Date.now())fail('This invitation has expired or been withdrawn. Ask the office for a new link.');}
function office(role){if(!['admin','manager','staff'].includes(role))fail('Your access level is read-only.');}
function archiveAgreement(g){if(g.agreement.status!=='not_issued'){(g.agreementHistory??=[]).push({...copy(g.agreement),supersededAt:new Date().toISOString()});}g.agreement={status:'not_issued'};}
function invalidate(g){if(g.credit.status!=='not_started')(g.creditHistory??=[]).push(copy(g.credit));g.credit={status:'not_started'};archiveAgreement(g);for(const d of g.documents)d.review='pending';}
function sync(s,g){s.enquiryRecords[g.tenantId]=copy(g.details);s.tenantRecords[g.tenantId]=copy(g.details);}
export function blockers(g){const a=[];if(!['submitted','approved','complete'].includes(g.status))a.push('Guarantor application must be submitted');for(const kind of categories)if(!g.documents.some(d=>d.kind===kind&&d.review==='approved'&&d.current))a.push(kind+' must be approved');if(g.credit.status!=='reviewed')a.push('Credit report needs an office review');return a;}
export function stageReady(s){return s.tenants.every(t=>typeof t.guarantorRequired==='boolean')&&s.tenants.filter(t=>t.guarantorRequired).every(t=>s.guarantors.some(g=>g.tenantId===t.id&&g.status==='complete'));}
export function applyAction(state,action,role='staff'){
 const s=copy(state),a=action,g=s.guarantors.find(x=>x.id===a.g),actor=role==='admin'?'Robert Fleming':role==='manager'?'Office Manager':'Marie Ellis';
 const publicActions=['submit','decline','sign','save_draft'];
 if(publicActions.includes(a.type)){checkLink(g,a.token);}else if(a.type!=='nominate'){office(role);}
 if(g&&a.revision!==undefined&&a.revision!==g.revision)fail('This record has changed. Reload before saving.');
 switch(a.type){
 case 'requirement':{
  const t=s.tenants.find(t=>t.id===a.tenantId);if(!t||typeof a.required!=='boolean')fail('Select an applicant and Yes or No');
  const linked=s.guarantors.filter(x=>x.tenantId===t.id);
  if(!a.required&&linked.some(x=>x.status==='complete'))fail('A completed guarantee needs a separately reviewed release');
  t.guarantorRequired=a.required;t.requirementDecidedBy=actor;
  if(!a.required){for(const x of linked){if(x.invitation)x.invitation.revoked=true;if(!['rejected','declined'].includes(x.status))x.status='withdrawn';invalidate(x);}}
  else for(const x of linked)if(x.status==='withdrawn')x.status='nominated';
  log(s,actor,'Guarantor requirement recorded',t.name+' · '+(a.required?'Required':'Not required')+' · Application Review');break;
 }

 case 'nominate':case 'add':{
  const tenant=s.tenants.find(t=>t.id===a.tenantId);if(!tenant)fail('Select the applicant this guarantor supports.');
  const d=a.details||{};if(!String(d.name||'').trim()||!/^\S+@\S+\.\S+$/.test(d.email||''))fail('Enter a name and valid email address.');
  if(a.type==='nominate'){
   const existing=s.guarantors.find(x=>x.tenantId===a.tenantId&&x.status!=='rejected'&&x.status!=='declined');
   if(existing){if(existing.revision>0||existing.status!=='nominated'){notify(s,'Tenant has proposed a guarantor change — office review required',existing);log(s,tenant.name,'New nomination held for office review',JSON.stringify(d),'Tenant application');s.pendingNomination={tenantId:a.tenantId,details:d};break;}existing.details={...existing.details,...d};sync(s,existing);log(s,tenant.name,'Guarantor nomination updated',d.name,'Tenant application');break;}
  }
  const n=newGuarantor('g'+(s.guarantors.length+1),a.tenantId,Object.fromEntries(fields.map(k=>[k,String(d[k]||'').trim()])),a.type==='nominate'?'Tenant application':'Office');s.guarantors.push(n);if(a.type==='add')tenant.guarantorRequired=true;sync(s,n);log(s,a.type==='nominate'?tenant.name:actor,'Guarantor added',n.details.name+' · '+tenant.name,n.source);break;
 }
 case 'invite':{
  if(!g)fail('Guarantor not found');if(s.tenants.find(t=>t.id===g.tenantId)?.guarantorRequired!==true)fail('Confirm that a guarantor is required in Application Review first');if(['approved','complete','rejected','declined'].includes(g.status))fail('Add a replacement or request changes before inviting again.');
  if(!g.details.email)fail('An email address is required');g.invitation={token:randomUUID(),expires:new Date(Date.now()+7*86400000).toISOString(),revoked:false};if(['nominated','withdrawn'].includes(g.status))g.status='invited';log(s,actor,'Test invitation prepared',g.details.email+' · expires in 7 days');queueEmail(s,g,'request',actor);break;
 }
 case 'revoke':if(!g?.invitation)fail('No invitation to withdraw');if(g.status==='complete')fail('A completed guarantee needs a separately reviewed release');g.invitation.revoked=true;g.status='withdrawn';archiveAgreement(g);log(s,actor,'Invitation withdrawn',g.details.name);break;
 case 'save_draft':if(!['invited','changes_requested'].includes(g.status))fail('This application is no longer editable');g.draft={...a.details};log(s,g.details.name,'Application draft saved','','Guarantor portal');break;
 case 'submit':{
  if(!['invited','changes_requested'].includes(g.status))fail('This application has already been submitted or closed.');
  const d=Object.fromEntries(fields.map(k=>[k,String(a.details?.[k]??'').trim()]));
  for(const k of ['name','email','phone','address','city','postcode','dob','relationship','addressSince','employment','income'])if(!d[k])fail('Complete all required personal, address and income fields.');
  if(!/^\S+@\S+\.\S+$/.test(d.email)||!/^\+?[\d ()-]{10,20}$/.test(d.phone))fail('Check the email and telephone number.');
  const dob=new Date(d.dob),adult=new Date();adult.setFullYear(adult.getFullYear()-18);if(!Number.isFinite(+dob)||dob>adult)fail('The guarantor must be at least 18.');
  const since=new Date(d.addressSince),threeYears=new Date();threeYears.setFullYear(threeYears.getFullYear()-3);if(!Number.isFinite(+since)||since>new Date())fail('Check the address start date.');if(since>threeYears&&!d.previousAddress)fail('Provide previous addresses covering the last three years.');
  if(!Number.isFinite(Number(d.income))||Number(d.income)<0)fail('Enter a valid annual income, including zero where applicable.');
  if(a.tenantId!==g.tenantId||!a.confirmApplicant)fail('Confirm the correct applicant before submitting.');
  if(!a.truth||!a.privacy||!a.creditAuthority||!a.understanding)fail('Complete each declaration and credit-check authority.');
  if(categories.some(k=>!g.documents.some(d=>d.kind===k&&d.current)))fail('Add primary ID, secondary ID and bank statements.');
  g.history.push({revision:g.revision,details:copy(g.details),source:g.source,at:new Date().toISOString()});g.details=d;g.source='Guarantor submission';g.status='submitted';g.revision++;g.submittedAt=new Date().toISOString();g.declarations={version:'application-v1',truth:true,privacy:true,creditAuthority:true,understanding:true,typedName:a.typedName||d.name,at:g.submittedAt};delete g.draft;invalidate(g);sync(s,g);log(s,d.name,'Guarantor application submitted; linked records updated','Revision '+g.revision+' · previous nomination preserved','Guarantor portal');notify(s,'Guarantor application submitted for '+s.tenants.find(t=>t.id===g.tenantId).name,g);break;
 }
 case 'decline':if(g.status==='complete')fail('A completed guarantee needs a separately reviewed release');g.status='declined';g.invitation.revoked=true;archiveAgreement(g);log(s,g.details.name,'Guarantor declined / wrong applicant',String(a.reason||'No reason supplied'),'Guarantor portal');notify(s,'Guarantor declined — replacement needed',g);break;
 case 'document_review':{
  if(g.status!=='submitted')fail('Review documents after the application is submitted');const d=g.documents.find(d=>d.id===a.documentId&&d.current);if(!d)fail('Document is no longer current');if(!['approved','rejected'].includes(a.decision))fail('Invalid review');if(a.decision==='rejected'&&!String(a.reason||'').trim())fail('Explain why this document was rejected');d.review=a.decision;d.reason=String(a.reason||'');log(s,actor,'Document '+a.decision,d.kind+(d.reason?' · '+d.reason:''));break;
 }
 case 'changes':case 'reject':{
  if(!g||!String(a.reason||'').trim())fail('Give a clear reason for the guarantor.');if(g.status==='complete')fail('A completed guarantee needs a separate reviewed variation.');g.status=a.type==='reject'?'rejected':'changes_requested';g.reason=a.reason;invalidate(g);if(a.type==='reject'&&g.invitation)g.invitation.revoked=true;log(s,actor,a.type==='reject'?'Guarantor rejected':'Changes requested',a.reason);notify(s,a.type==='reject'?'Guarantor rejected — replacement required':'Guarantor asked to correct application',g);break;
 }
 case 'credit_start':if(g.status!=='submitted'||!g.declarations?.creditAuthority)fail('A submitted application and credit authority are required');if(g.credit.status!=='not_started')fail('A check is already in progress or complete');g.credit={status:'requested',provider:'demo',requestId:randomUUID(),clientReferenceId:g.id+'-v'+g.revision,requestType:'GUARANTOR_SCREENING',itemType:'FULL',revision:g.revision};log(s,actor,'Demo guarantor credit request created',g.credit.clientReferenceId);break;
 case 'credit_result':if(g.credit.status!=='requested')fail('Start a test check first');g.credit.status='report_received';g.credit.report='DEMO REPORT — fictional identity and income evidence, no credit bureau queried. Office review required.';log(s,'Demo reference provider','Sample report received',g.credit.requestId,'Provider simulator');notify(s,'Guarantor credit report is ready for review',g);break;
 case 'credit_review':if(g.credit.status!=='report_received'||!String(a.reason||'').trim())fail('Read the received report and record the review outcome');g.credit.status='reviewed';g.credit.reviewedBy=actor;g.credit.reviewNote=a.reason;log(s,actor,'Credit report reviewed',a.reason);break;
 case 'approve':{if(g.status!=='submitted')fail('Only a submitted application can be approved');const b=blockers(g);if(b.length)fail(b.join('; '));g.status='approved';g.approvedBy=actor;log(s,actor,'Guarantor approved for proposed tenancy',g.details.name);break;}
 case 'issue':if(!['admin','manager'].includes(role))fail('A manager must authorise the proposed guarantee');if(g.status!=='approved'||g.agreement.status!=='not_issued'||!a.legalDemo||!a.beforeTenancy)fail('Complete office approval and confirm the test legal/signing checks; an existing agreement cannot be overwritten');g.agreement={status:'issued',version:'G-2026-preview-1',revision:g.revision,issuedAt:new Date().toISOString(),snapshot:copy(g.details),guaranteedTenantId:g.tenantId,monthlyLimit:500,totalCap:6000,guaranteeStart:'2026-11-01',guaranteeEnd:'2027-10-31'};log(s,actor,'Non-binding sample guarantee issued',g.agreement.version);break;
 case 'sign':if(g.agreement.status!=='issued'||g.agreement.revision!==g.revision)fail('No current agreement is available to sign');if(!a.ack||String(a.typedName||'').trim().toLowerCase()!==g.details.name.toLowerCase())fail('Read the agreement, confirm it and enter your full name');g.agreement.status='guarantor_signed';g.agreement.signedAt=new Date().toISOString();g.agreement.signer=a.typedName;log(s,g.details.name,'Sample guarantee attested',g.agreement.version+' · NON-BINDING','Guarantor portal');notify(s,'Guarantor has completed the sample guarantee',g);break;
 case 'landlord_accept':if(!['admin','manager'].includes(role)||g.agreement.status!=='guarantor_signed')fail('Manager acceptance requires the guarantor attestation first');g.agreement.status='complete';g.agreement.acceptedAt=new Date().toISOString();g.status='complete';log(s,actor,'Landlord acceptance simulated; guarantor stage complete','NON-BINDING · '+s.property.landlord);break;
 case 'read_notifications':s.notifications.forEach(n=>n.read=true);break;
 default:fail('Unknown action');
 }
 if(stageReady(s))for(const completed of s.guarantors.filter(x=>x.status==='complete'))queueEmail(s,completed,'complete',actor);
 s.version++;return s;
}
export function addDocument(state,id,token,document){const s=copy(state),g=s.guarantors.find(g=>g.id===id);checkLink(g,token);if(!['invited','changes_requested'].includes(g.status))fail('Ask the office to reopen the application before replacing documents');if(!categories.includes(document.kind))fail('Choose a requested document category');for(const d of g.documents)if(d.kind===document.kind)d.current=false;g.documents.push({...document,review:'pending',current:true});log(s,g.details.name,'Document uploaded',document.kind+' · pending review','Guarantor portal');s.version++;return s;}
