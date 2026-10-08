require('../../backend/node_modules/tsx/dist/cjs/index.cjs');
const {prepareEmailHtml}=require('../../backend/src/email-presentation.ts');
const fs=require('fs'),path=require('path');
const root='tmp/guarantor-crm-preview/frontend',pub=root+'/public';
const fixture=JSON.parse(fs.readFileSync('tmp/service-ui-fit-fixture.json'));
const records={};
for(const id of [83,84]){
 const source=fixture['/api/tenant-enquiries/'+id].data;
 const allowed=['id','first_name_1','last_name_1','email_1','phone_1','date_of_birth_1','joint_partner_id','linked_property_id','current_address','current_postcode','employment_status','annual_income','app_form_data','application_section_reviews'];
 const record=Object.fromEntries(allowed.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
 for(const key of Object.keys(record.app_form_data||{}))if(/signature|token|slug|national_insurance|bank|sort_code|account_number/i.test(key))delete record.app_form_data[key];
 Object.assign(record,{status:'onboarding',property_address:'24 Example Gardens',property_postcode:'WV10 9TG',holding_deposit_requested:1,holding_deposit_received:1,holding_deposit_amount:230,holding_deposit_received_amount:230,monthly_rent_agreed:1000,security_deposit_amount:1000,application_form_completed:1,application_review_status:'approved',application_section_reviews:{'Application Details':{status:'approved'}},credit_check_completed:0,tenancy_agreement_sent:0,guarantor_name:'Robin Taylor',guarantor_email:'robin.taylor@example.test',guarantor_phone:'07700 900123'});
 Object.assign(record.app_form_data,{tenancy_duration:'Assured periodic tenancy',tenancy_start_date:'2026-11-01'});records[id]=record;
}
const documents=Object.fromEntries([83,84].map(id=>[id,['Primary Identification','Secondary Identification','Bank Statements','Proof of Income or Employment'].map((type,n)=>({id:id*100+n,entity_type:'tenant_enquiry',entity_id:id,doc_type:type,original_name:`TEST ONLY - ${records[id].first_name_1} - ${type}.pdf`,review_status:'approved',mime_type:'application/pdf',uploaded_at:'2026-09-30T09:00:00Z'}))]));
const seed={records,documents,properties:[{id:26,address:'24 Example Gardens',postcode:'WV10 9TG',rent_amount:1000,landlord_id:11,landlord_name:'Alex Morgan',landlord_address:'8 Example Lane, Wolverhampton, WV1 1AA',landlord_type:'individual',service_type:'full_management'}],user:{id:1,name:'Preview Administrator',email:'admin@example.test',role:'admin',is_active:1,appearance:{font:'arial',scale:100,background:'light'}},activity:[],reviews:{},documentReviews:{},reviewStatus:'pending'};
fs.writeFileSync(pub+'/preview-seed.json',JSON.stringify(seed));
fs.copyFileSync('prototypes/guarantor-crm-review/preview-api.js',pub+'/preview-api.js');
fs.copyFileSync('prototypes/guarantor-witness-review/model.mjs',pub+'/preview-model.mjs');
fs.mkdirSync(pub+'/guarantor',{recursive:true});
for(const name of ['index.html','app.mjs','model.mjs','office.mjs','style.css','review.css','onboarding.css','guarantor-email.html','witness-email.html','email-assets'])fs.cpSync('prototypes/guarantor-witness-review/'+name,pub+'/guarantor/'+name,{recursive:true});
// Sandboxed email previews cannot use the protected deployment's authentication cookie.
// Embed the supplied email artwork so both office and public previews render reliably.
for(const name of ['guarantor-email.html','witness-email.html']){
 const file=pub+'/guarantor/'+name;
 const html=prepareEmailHtml(fs.readFileSync(file,'utf8')).replace(/src="(?:email-assets\/|https:\/\/crm\.fleminglettings\.co\.uk\/email-assets\/)([^"/]+\.png)"/g,(_,asset)=>'src="data:image/png;base64,'+fs.readFileSync(pub+'/guarantor/email-assets/'+asset).toString('base64')+'"');
 fs.writeFileSync(file,html);
}
let script=fs.readFileSync(pub+'/guarantor/app.mjs','utf8').replaceAll('sessionStorage','localStorage').replace("fleming-witness-review-20260930-v2","fleming-crm-preview-guarantor");
script=script.replace('state=transition(state,action,data);', 'state=transition(JSON.parse(localStorage.getItem(key))||state,action,data);');
script=script.replace("window.addEventListener('hashchange',render);render();", `function trackOpen(){state=JSON.parse(localStorage.getItem(key))||state;const witness=current()==='witness';if((current()==='apply'&&state.status!=='draft')||(witness&&state.signed)){const at=new Date().toISOString();state[witness?'witnessOpenedAt':'openedAt']=at;state.events.push({action:witness?'witness_opened':'guarantor_opened',at});localStorage.setItem(key,JSON.stringify(state));}render();}window.addEventListener('hashchange',trackOpen);trackOpen();`);
script=script.replace("const go=page=>{", "const go=page=>{if(page==='office'){location.href='/enquiries/84?onboarding=1';return;}");
const a=script.indexOf('function shell(body)'),b=script.indexOf('function office()',a);
script=script.slice(0,a)+`function shell(body){app.innerHTML='<div class="preview"><span><strong>CRM TEST</strong> · Fictional information only. No emails or legal signatures.</span><a href="/enquiries/84?onboarding=1">Return to CRM record</a></div><header class="top"><div class="brand"><img src="email-assets/fleming-logo-white.png" alt="Fleming Lettings"></div></header>'+body+'<footer class="footer">Test application · Saved in this browser only.</footer>';bind()}\n`+script.slice(b);
script=script.replace("const page=current();if(page", "const page=current();if(page==='office'){location.replace('/enquiries/84?onboarding=1');return}if(page");
fs.writeFileSync(pub+'/guarantor/app.mjs',script);
let index=fs.readFileSync('frontend/index.html','utf8');index=index.replace('<head>','<head><script type="module" src="/preview-api.js"></script>');
// Keep module startup behind the isolated API adapter, including its seed load.
index=index.replace('src="/src/main.tsx"','src="/src/preview-main.ts"');fs.writeFileSync(root+'/index.html',index);
fs.writeFileSync(root+'/src/preview-main.ts',"await (window as any).crmPreviewReady; await import('./main'); export {};\n");
fs.copyFileSync('prototypes/guarantor-crm-review/GuarantorReview.tsx',root+'/src/components/GuarantorReview.tsx');
let wizard=fs.readFileSync('frontend/src/components/ui/OnboardingWizard.tsx','utf8');
wizard=wizard.replace('readyForApproval?: boolean','readyForApproval?: boolean; statusLabel?: string').replace("{step.readyForApproval ? 'Ready to Approve'", "{step.statusLabel ? step.statusLabel : step.readyForApproval ? 'Ready to Approve'");
wizard="import {UserCheck} from 'lucide-react';\nimport GuarantorReview from '../GuarantorReview';\n"+wizard;
wizard=wizard.replace('  const [activeStep, setActiveStep] = useState(0);',`  const [activeStep, setActiveStep] = useState(3);
  const [guarantor,setGuarantor]=useState<any>(null);
  const refreshGuarantor=async()=>{const data=await api.get('/api/preview/guarantor');setGuarantor(data);if(data.tenancy?.startDate)setAgreementStartDate(data.tenancy.startDate);return data;};
  useEffect(()=>{void refreshGuarantor();const refresh=()=>void refreshGuarantor();window.addEventListener('focus',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('storage',refresh);};},[]);
  const guarantorReady=guarantor?.required===false||guarantor?.status==='verified';
  const guarantorChangesRequired=guarantor?.record?.application_review_status==='changes_requested'||Object.values(guarantor?.record?.application_section_reviews||{}).some((review:any)=>review.status==='rejected')||(guarantor?.documents||[]).some((doc:any)=>doc.review_status==='rejected');
  const guarantorStep={label:'Guarantor Review',icon:UserCheck,desc:'Application, deed of guarantee and verification',statusLabel:guarantor?.status==='verified'?'Approved':guarantor?.deedNeedsResigning?'New Signing Required':guarantor?.status==='witness_declined'?'Witness Declined':guarantor?.record?.application_review_status==='changes_requested'?'Waiting on Guarantor':guarantorChangesRequired?'Changes Required':guarantor?.witnessed?'Ready for Review':guarantor?.signed?'Awaiting Witness':guarantor?.status==='invited'?'Awaiting Guarantor':'Not Sent',getStatus:()=>guarantor?.status==='verified'?'green':'amber'};
  const navigateStage=(idx:number)=>{if(idx>=4&&idx!==9&&!guarantorReady){setActiveStep(guarantor?.required?9:3);return;}setActiveStep(idx);};
  const chooseGuarantor=async(value:boolean)=>{try{setReviewError('');const data=await api.post('/api/preview/guarantor',{action:'require',value});setGuarantor(data);setActiveStep(value?9:4);}catch(e){setReviewError(String(e));}};
  const resetGuarantor=async()=>{try{setReviewError('');const data=await api.post('/api/preview/guarantor',{action:'reset'});setGuarantor(data);setActiveStep(3);}catch(e){setReviewError(String(e));}};`);
wizard=wizard.replace('    if (!enquiry.holding_deposit_requested) setActiveStep(0);',"    if (!guarantor || guarantor.required===null) setActiveStep(3);\n    else if(guarantor.required && guarantor.status!=='verified') setActiveStep(9);\n    else if (!enquiry.holding_deposit_requested) setActiveStep(0);");
wizard=wizard.replace('  }, [enquiryId,jointApplication?.record.credit_check_completed', '  }, [guarantor?.required,guarantor?.status,enquiryId,jointApplication?.record.credit_check_completed');
wizard=wizard.replace('  const depositRequestContent = <>',"  if(guarantor?.required)navigationSteps.splice(3,0,{...guarantorStep,index:9,getStatus:()=>guarantor?.status==='verified'?'green':'amber'});\n  if(!guarantorReady)for(const step of navigationSteps){if(step.index>=4&&step.index!==9)step.getStatus=()=> 'grey';}\n  const depositRequestContent = <>");
// Keep credit checking out of both menus until the guarantor decision/review is complete.
wizard=wizard.replaceAll('navigationSteps.map(', 'visibleNavigationSteps.map(');
wizard=wizard.replace('  const depositRequestContent = <>', '  const visibleNavigationSteps=navigationSteps.filter(step=>step.index!==4||guarantorReady);\n  const progressSteps=navigationSteps.filter(step=>step.index!==8);\n  const depositRequestContent = <>');
wizard=wizard.replace("{navigationSteps.filter(s => s.getStatus() === 'green' && !s.readyForApproval).length}/{navigationSteps.length}", "{progressSteps.filter(step=>step.getStatus()==='green'&&!step.readyForApproval).length}/{progressSteps.length}");
wizard=wizard.replaceAll('onClick={()=>setActiveStep(idx)}','onClick={()=>navigateStage(idx)}').replace('onChange={e=>setActiveStep(Number(e.target.value))}','onChange={e=>navigateStage(Number(e.target.value))}');
wizard=wizard.replace('key={step.label} type="button" style=', 'key={step.label} type="button" disabled={idx>=4&&idx!==9&&!guarantorReady} title={idx>=4&&idx!==9&&!guarantorReady?"Complete the guarantor decision and any required review first":undefined} style=');
wizard=wizard.replace("shrink-0 flex items-center gap-3 rounded-xl border px-3", "disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-3 rounded-xl border px-3");
wizard=wizard.replace('<option key={step.label} value={step.index}>','<option key={step.label} value={step.index} disabled={step.index>=4&&step.index!==9&&!guarantorReady}>');
const start=wizard.indexOf('<StepCard idx={3}'),end=wizard.indexOf('</StepCard>',start)+11;
let panel=wizard.slice(start,end).replace("'grid grid-cols-1 lg:grid-cols-2 gap-4 lg:h-full min-h-0':'h-full min-h-0'","'grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0':'min-h-0'");
panel=panel.replace('</StepCard>',`{tenantReviewsComplete&&guarantor&&<section aria-label="Guarantor requirement" className={'rounded-xl border p-4 space-y-3 '+(guarantor.required===null?'border-amber-500/30 bg-amber-500/10':'border-emerald-500/30 bg-emerald-500/10')}>
<div className="flex items-center justify-between gap-3"><h5 className="font-semibold">Is a Guarantor Required? <span className="text-red-600">*</span></h5><span role="status" className={guarantor.required===null?'shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-sm font-medium text-[var(--onboarding-warning)]':'shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-sm font-medium text-[var(--onboarding-success)]'}>{guarantor.required===null?'Pending':'Completed'}</span></div><p className="text-sm text-[var(--text-secondary)]">Tenant application reviews are complete. Choose Yes or No to continue.</p>
<div className="flex flex-wrap items-center gap-3">{[true,false].map(value=><button key={String(value)} type="button" aria-pressed={guarantor.required===value} style={{fontWeight:guarantor.required===value?700:400}} disabled={guarantor.status!=='draft'} onClick={()=>void chooseGuarantor(value)} className={'inline-flex items-center justify-center rounded-full border px-6 py-2.5 text-sm transition-all disabled:cursor-not-allowed '+(guarantor.required===value?'border-emerald-500/50 bg-emerald-500/20 font-bold text-[var(--onboarding-success)] ring-1 ring-emerald-500/30':'border-[var(--border-input)] font-normal hover:bg-[var(--bg-hover)]')}>{value?'Yes — Guarantor Required':'No — Continue to Credit Check'}</button>)}{guarantor.required!==null&&<button type="button" onClick={()=>void resetGuarantor()} className="inline-flex items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-6 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-500/20">Reset</button>}</div>
{reviewError&&<p role="alert">{reviewError}</p>}</section>}</StepCard>
<StepCard idx={9} step={guarantorStep} {...stepCardProps}><GuarantorReview onChange={refreshGuarantor} onContinue={()=>setActiveStep(4)}/></StepCard>`);
wizard=wizard.slice(0,start)+panel+wizard.slice(end);wizard=wizard.replace('split && idx !== 4 ?', 'split && idx !== 4 && idx !== 3 ?');
wizard=wizard.replace('  const navigationSteps =',`  const reviewCompleted=(record:Record<string,any>|undefined,documents:Record<string,any>[])=>{
    if(!record?.application_form_completed||record.application_review_status!=='approved')return false;
    const sections=applicationReviewSections(record),reviews=record.application_section_reviews||{};
    if(!sections.length||!sections.every(section=>(reviews[section.title]||reviews['Application Details']||{status:'approved'}).status==='approved'))return false;
    const required=['Primary Identification','Secondary Identification','Bank Statements',...(['Student','Unemployed'].includes(record.app_form_data?.employment_status)?[]:['Proof of Income or Employment'])];
    return !documents.some(doc=>doc.review_status==='rejected')&&required.every(type=>documents.some(doc=>doc.doc_type===type&&doc.review_status==='approved')||record.application_document_overrides?.[type]?.status==='overridden');
  };
  const tenantReviewsComplete=reviewCompleted(enquiry,enquiryDocs)&&(!enquiry.joint_partner_id||reviewCompleted(jointApplication?.record,jointApplication?.documents||[]));
  useEffect(()=>{if(activeStep>=4&&activeStep!==9&&!guarantorReady)setActiveStep(guarantor?.required?9:3)},[activeStep,guarantorReady,guarantor?.required]);
  useEffect(()=>{if(activeStep===3&&tenantReviewsComplete&&guarantor?.required===null){const frame=requestAnimationFrame(()=>document.querySelector('[aria-label="Guarantor requirement"]')?.scrollIntoView({block:'end'}));return()=>cancelAnimationFrame(frame)}},[activeStep,guarantor?.required,tenantReviewsComplete]);
  const navigationSteps: {label:string;index:number;icon:React.ElementType;getStatus:()=>string;desc:string;readyForApproval?:boolean}[] =`);
wizard=wizard.replace('disabled={saving} onClick={()=>saveSection(\'Application Details\',\'pending\')}', 'className="review-reset" disabled={saving} onClick={()=>saveSection(\'Application Details\',\'pending\')}');
wizard=require('./credit-stage.cjs')(wizard);
fs.writeFileSync(root+'/src/components/ui/OnboardingWizard.tsx',wizard);
let review=fs.readFileSync('frontend/src/components/ApplicationReviewPanel.tsx','utf8');review=review.replace("const url=`https://apply.fleminglettings.co.uk/${enquiry.application_form_slug||enquiry.application_form_token}`;", "const url=enquiry.id===9001?location.origin+'/guarantor/index.html#apply':location.origin+'/enquiries/'+enquiry.id;");fs.writeFileSync(root+'/src/components/ApplicationReviewPanel.tsx',review);
review=review.replace('className="review-reject" disabled={busy||waiting} onClick={()=>void sectionReview(title,\'pending\')}', 'className="review-reject review-reset" disabled={busy||waiting} onClick={()=>void sectionReview(title,\'pending\')}').replace("isOverridden(type)?'review-reject':'review-approve'", "isOverridden(type)?'review-reject review-reset':'review-approve'").replace('disabled={busy||waiting} onClick={()=>void documentReview(doc.id,\'pending\')}', 'className="review-reset" disabled={busy||waiting} onClick={()=>void documentReview(doc.id,\'pending\')}');
fs.writeFileSync(root+'/src/components/ApplicationReviewPanel.tsx',review);
fs.writeFileSync(pub+'/preview-banner.css', '.crm-preview-label{position:fixed;bottom:5px;left:8px;z-index:200;font:11px Arial;background:#fef3c7;border:1px solid #fbbf24;border-radius:15px;padding:5px 10px;color:#713f12;pointer-events:none}.review-reset{color:#b91c1c!important;background:rgba(239,68,68,.1)!important;border-color:rgba(239,68,68,.4)!important}.review-reset:hover{background:rgba(239,68,68,.2)!important}');
fs.writeFileSync(pub+'/preview-config.json',JSON.stringify({testOnly:true}));
const communications=fs.readFileSync('frontend/src/components/ui/CommunicationsHistory.tsx','utf8').replace('variant="ghost" onClick={() => setPreview(message)}','variant="outline" className="communications-view-email" onClick={() => setPreview(message)}');
fs.writeFileSync(root+'/src/components/ui/CommunicationsHistory.tsx',communications);
fs.appendFileSync(pub+'/preview-banner.css','\n.communications-view-email{border:1px solid #d1d5db!important;border-radius:999px!important;background:#f3f4f6!important;color:#374151!important;padding:7px 16px!important;transition:background-color .15s,color .15s}.communications-view-email:hover,.communications-view-email:focus-visible{background:#6b7280!important;border-color:#6b7280!important;color:white!important}\n');
for(const name of ['public-form.mjs','public-flow.mjs','file-store.mjs','deed.mjs','public-form.css','introduction.mjs','employment.mjs'])fs.copyFileSync('prototypes/guarantor-crm-review/'+name,pub+'/guarantor/'+name);
fs.copyFileSync('prototypes/guarantor-crm-review/public-form.html',pub+'/guarantor/index.html');
for(const name of ['signature-editor.js','signature-controls.css','signing-layout.css'])fs.copyFileSync('tenants-subdomain/'+name,pub+'/guarantor/'+name);
const application=fs.readFileSync('tenants-subdomain/application.html','utf8');
fs.copyFileSync('tenants-subdomain/form-typography.css',pub+'/guarantor/form-typography.css');
const calendarMarkup=application.slice(application.indexOf('    <!-- Date Picker Overlay'),application.indexOf('    <script src="/application-deadline.js"'));
const calendarScript=application.slice(application.indexOf("        const dpMonths ="),application.indexOf('        function formatSortCode'));
fs.writeFileSync(pub+'/guarantor/date-picker.js',calendarScript.replace("formData?.application_data_approved||document.getElementById(inputId)?.disabled","document.getElementById(inputId)?.matches(':disabled')")+"\ndocument.addEventListener('click',e=>{if(!e.target.closest('.date-picker-dropdown')&&!e.target.closest('.date-picker-wrapper'))closeDatePicker();});\n");
let publicHtml=fs.readFileSync(pub+'/guarantor/index.html','utf8').replace('</head>','<link rel="stylesheet" href="form-typography.css"></head>').replace('<script type="module"',calendarMarkup+'<script src="date-picker.js"></script><script type="module"');
publicHtml=publicHtml.replace('public-form.mjs','public-form.mjs?v=04oct-submit-v3').replace('public-form.css','public-form.css?v=04oct-submit-v3');
fs.writeFileSync(pub+'/guarantor/index.html',publicHtml);
const guideMarkup=application.slice(application.indexOf('    <dialog id="document-guide"'),application.indexOf('    <!-- Date Picker Overlay'));
let guideScript=application.slice(application.indexOf('        const documentGuides ='),application.indexOf('        // API Configuration'));
guideScript+="\ndocumentGuides.income.items.unshift('Contract of Employment: a signed current contract confirming your role and pay. Supply current payslips too where available.');documentGuides.reference={title:'📄 Employment Reference (Optional)',intro:'You may upload a reference you already hold. This upload is optional.',items:['A signed employer letter confirming your employment.','An accountant or professional reference supporting your income.'],note:'The office can contact the referee you authorise on your application. You can continue without uploading a reference.'};\n";
fs.writeFileSync(pub+'/guarantor/document-guides.js',guideScript);
fs.writeFileSync(pub+'/guarantor/index.html',publicHtml.replace('<script src="date-picker.js">',guideMarkup+'<script src="document-guides.js"></script><script src="date-picker.js">'));
// The public form validates the active employment fields. A reference upload is optional.
let model=fs.readFileSync('prototypes/guarantor-witness-review/model.mjs','utf8').replace("'employment','employer','reference','referenceEmail','income'","'employment','income'").replace('[f.email,f.referenceEmail,f.witnessEmail]','[f.email,f.witnessEmail]').replace('evidence.every(x=>s.docs.includes(x))','evidence.slice(0,4).every(x=>s.docs.includes(x))').replace('Add all five evidence categories before signing.','Add the four required evidence categories before signing.');
fs.writeFileSync(pub+'/guarantor/model.mjs',model);fs.writeFileSync(pub+'/preview-model.mjs',model);
for(const name of ['letterhead-header.png','letterhead-footer.png'])fs.copyFileSync('backend/src/agreement-assets/'+name,pub+'/guarantor/'+name);
fs.writeFileSync(pub+'/guarantor/application-base.css',application.match(/<style[^>]*>([\s\S]*?)<\/style>/i)[1]);
let witnessHtml=fs.readFileSync('prototypes/guarantor-crm-review/witness-request.html','utf8');
witnessHtml=witnessHtml.replace(/src="([^"]+\.png)"/g,(_,asset)=>'src="data:image/png;base64,'+fs.readFileSync('prototypes/guarantor-crm-review/witness-assets/'+path.basename(asset)).toString('base64')+'"');
fs.writeFileSync(pub+'/guarantor/witness-email.html',witnessHtml);
console.log('Prepared actual CRM preview with isolated fictional records.');

fs.copyFileSync('prototypes/guarantor-crm-review/signed-copy.mjs',pub+'/guarantor/signed-copy.mjs');fs.copyFileSync('backend/node_modules/pdf-lib/dist/pdf-lib.esm.min.js',pub+'/guarantor/pdf-lib.esm.min.js');if(fs.existsSync('prototypes/guarantor-crm-review/rejection-state.json'))fs.copyFileSync('prototypes/guarantor-crm-review/rejection-state.json',pub+'/guarantor/rejection-state.json');
fs.copyFileSync('prototypes/guarantor-crm-review/rejection-email.html',pub+'/guarantor/rejection-email.html');

let rejectionHtml=prepareEmailHtml(fs.readFileSync('backend/src/email-templates/05-application-review.html','utf8'));rejectionHtml=rejectionHtml.replace(/src="(?:assets\/|https:\/\/crm\.fleminglettings\.co\.uk\/email-assets\/)([^"/]+)"/g,(_,asset)=>'src="data:image/png;base64,'+fs.readFileSync('backend/src/email-assets/'+asset).toString('base64')+'"');fs.writeFileSync(pub+'/guarantor/application-review-email.html',rejectionHtml);

fs.copyFileSync('prototypes/guarantor-crm-review/deed-review.html',pub+'/guarantor/deed-review.html');

fs.cpSync('prototypes/guarantor-crm-review/appendices',pub+'/guarantor/appendices',{recursive:true});fs.copyFileSync('prototypes/guarantor-crm-review/apt-manifest.mjs',pub+'/guarantor/apt-manifest.mjs');
let finalPublic=fs.readFileSync(pub+'/guarantor/index.html','utf8');if(!finalPublic.includes('rel="icon"'))finalPublic=finalPublic.replace('</head>','<link rel="icon" type="image/png" href="/logo-icon.png"></head>');fs.writeFileSync(pub+'/guarantor/index.html',finalPublic);

for(const file of ['paged-deed.mjs','witness-messages.html'])fs.copyFileSync('prototypes/guarantor-crm-review/'+file,pub+'/guarantor/'+file);

require('./prepare-agreement-preview.cjs');

let completionHtml=prepareEmailHtml(fs.readFileSync('prototypes/guarantor-crm-review/completed-deed-email.html','utf8'));completionHtml=completionHtml.replace(/src="(?:assets\/|https:\/\/crm\.fleminglettings\.co\.uk\/email-assets\/)([^"/]+)"/g,(_,asset)=>'src="data:image/png;base64,'+fs.readFileSync('backend/src/email-assets/'+asset).toString('base64')+'"');fs.writeFileSync(pub+'/guarantor/completed-deed-email.html',completionHtml);
