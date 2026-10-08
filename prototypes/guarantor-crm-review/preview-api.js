window.crmPreviewReady=(async()=>{
 const nativeFetch=window.fetch.bind(window),{initialState,transition}=await import('/preview-model.mjs');
 const seed=await nativeFetch('/preview-seed.json').then(r=>r.json());
 const companyBanks=await nativeFetch('/guarantor/company-bank-details.json').then(r=>r.json());
 const scenarioName=new URLSearchParams(location.search).get('scenario'),scenario=scenarioName==='corrections',directReview=['waiting-witness','deed-review'].includes(scenarioName);const scenarioSuffix=scenario?'-corrections':directReview?'-'+scenarioName+'-v4':['review-rejection','review-changes','tenant-rejection'].includes(scenarioName)?'-'+scenarioName+'-v1':'';const previewRun=(new URLSearchParams(location.search).get('run')||'').replace(/[^a-zA-Z0-9-]/g,'').slice(0,40),suffix=scenarioSuffix+(previewRun?'-run-'+previewRun:'');const dataKey='fleming-crm-preview-records'+suffix,guarKey='fleming-crm-preview-guarantor'+suffix;window.crmPreviewKeys={dataKey,guarKey};if(scenario&&!localStorage.getItem(guarKey)){const fixture=await nativeFetch('/guarantor/rejection-state.json').then(r=>r.json());localStorage.setItem(guarKey,JSON.stringify(fixture.g));localStorage.setItem(dataKey,JSON.stringify(fixture.data));}
 if(directReview&&!localStorage.getItem(guarKey)){
  const fixture=await nativeFetch('/guarantor/rejection-state.json').then(r=>r.json()),g=fixture.g,{deed,version}=await import('/guarantor/deed.mjs');
  g.introAcceptedAt=new Date().toISOString();g.required=true;g.witnessed=null;g.completionEmail=null;g.completedDocument=null;g.witnessSignatureImage=null;g.deedNeedsResigning=false;g.revisionEdits=[];g.revisionUploads=[];g.status=scenarioName==='waiting-witness'?'awaiting_witness':'invited';g.signed=scenarioName==='waiting-witness'?{name:g.form.name,at:new Date().toISOString(),version,witness:g.form.witnessName}:null;if(!g.signed){g.signatureImage=null;g.form.readDeed=false;g.form.readTenancy=false;g.form.presentNow=false;}
  const primary=seed.records[84],partner=seed.records[primary.joint_partner_id],property=seed.properties[0],money=value=>Number(value).toLocaleString('en-GB',{style:'currency',currency:'GBP'});
  g.signedDocument=g.signed?deed(g,{landlord:property.landlord_name,serviceType:property.service_type,landlordType:property.landlord_type,landlordAddress:property.landlord_address,tenants:[primary,partner].filter(Boolean).map(r=>r.first_name_1+' '+r.last_name_1).join(' and '),property:primary.property_address+', '+primary.property_postcode,start:primary.app_form_data.tenancy_start_date+'T12:00:00Z',rent:money(primary.monthly_rent_agreed),deposit:money(primary.security_deposit_amount)}):null;
  const {PDFDocument}=await import('/guarantor/pdf-lib.esm.min.js'),{putFile}=await import('/guarantor/file-store.mjs'),evidence=await PDFDocument.create();evidence.addPage().drawText('Fictional supporting evidence for the review screen only.',{x:30,y:700,size:12});const bytes=await evidence.save();for(const [index,file]of Object.entries(g.uploads||{})){file.key=scenarioName+'-sample-'+index;await putFile(file.key,new Blob([bytes],{type:'application/pdf'}));}
  const data=structuredClone(seed);data.reviewStatus='pending';data.reviews={};data.documentReviews={};data.changesSent=null;data.changes=null;localStorage.setItem(guarKey,JSON.stringify(g));localStorage.setItem(dataKey,JSON.stringify(data));
 }
 if(['review-rejection','review-changes'].includes(scenarioName)&&!localStorage.getItem(guarKey)){
  const fixture=await nativeFetch('/guarantor/rejection-state.json').then(r=>r.json()),g=fixture.g;
  const data=structuredClone(seed);data.reviews=Object.fromEntries(Object.keys(fixture.data.reviews).map(key=>[key,{status:'approved'}]));data.reviews['Employment & Income']={status:'rejected',reason:'Please provide the full address of your employer.'};data.reviewStatus='pending';data.documentReviews=Object.fromEntries(Object.keys(fixture.data.documentReviews).map(key=>[key,{status:'approved'}]));data.changesSent=null;data.changes=null;g.revisionEdits=[];g.revisionUploads=[];
  const {PDFDocument}=await import('/guarantor/pdf-lib.esm.min.js'),{putFile}=await import('/guarantor/file-store.mjs'),evidence=await PDFDocument.create();evidence.addPage().drawText('Fictional supporting evidence for review only.',{x:30,y:700,size:12});const bytes=await evidence.save();for(const [index,file]of Object.entries(g.uploads||{})){file.key=guarKey+'-evidence-'+index;await putFile(file.key,new Blob([bytes],{type:'application/pdf'}));}
  const {deed,withWitnessSignature}=await import('/guarantor/deed.mjs'),primary=seed.records[84],partner=seed.records[primary.joint_partner_id],property=seed.properties[0],money=value=>Number(value).toLocaleString('en-GB',{style:'currency',currency:'GBP'});
  g.signedDocument=deed(g,{landlord:property.landlord_name,landlordType:property.landlord_type,landlordAddress:property.landlord_address,tenants:[primary,partner].filter(Boolean).map(r=>r.first_name_1+' '+r.last_name_1).join(' and '),property:primary.property_address+', '+primary.property_postcode,start:primary.app_form_data.tenancy_start_date,rent:money(primary.monthly_rent_agreed),deposit:money(primary.security_deposit_amount)});g.completedDocument=withWitnessSignature(g.signedDocument,g);
  const {makeSignedPdf}=await import('/guarantor/signed-copy.mjs'),pdfBytes=await makeSignedPdf(g.completedDocument),pdfKey=guarKey+'-signed';await putFile(pdfKey,new Blob([pdfBytes],{type:'application/pdf'}));g.completionEmail.attachment={key:pdfKey,name:'Deed of Guarantee - signed.pdf',type:'application/pdf'};
  if(scenarioName==='review-changes'){const at=new Date().toISOString();data.reviewStatus='changes_requested';data.changesSent=at;data.changes={message:data.reviews['Employment & Income'].reason,requested_at:at};data.changeRequestDelivery={email:true,sms:false,at,simulated:true};g.events.push({action:'changes_requested',at});}
  localStorage.setItem(guarKey,JSON.stringify(g));localStorage.setItem(dataKey,JSON.stringify(data));
 }
 if(scenarioName==='tenant-rejection'&&!localStorage.getItem(dataKey)){
  const data=structuredClone(seed),record=data.records[84];record.application_review_status='pending';record.application_changes_sent_at=null;record.application_section_reviews={...record.application_section_reviews,'Employment & Income':{status:'rejected',reason:'Please provide the full address of your employer.'}};localStorage.setItem(dataKey,JSON.stringify(data));localStorage.setItem(guarKey,JSON.stringify(initialState()));
 }
 let data;try{data=JSON.parse(localStorage.getItem(dataKey))||seed}catch{data=seed}
 if(data.records[84]?.source_tenant_id){Object.assign(data.records[84],{holding_deposit_amount:0,holding_deposit_received_amount:0,holding_deposit_received:0,holding_deposit_requested:0});}
 const readGuar=()=>{try{return JSON.parse(localStorage.getItem(guarKey))||initialState()}catch{return initialState()}};
 const save=()=>localStorage.setItem(dataKey,JSON.stringify(data));
 const saveGuar=g=>localStorage.setItem(guarKey,JSON.stringify(g));
 if(!localStorage.getItem(guarKey))saveGuar(initialState());
 if(['agreement-ready','agreement-sent'].includes(new URLSearchParams(location.search).get('stage'))&&!data.agreementTestReady){
  const g=readGuar();g.required=true;g.status='verified';data.reviewStatus='approved';for(const review of Object.values(data.reviews||{}))review.status='approved';data.changesSent=null;data.changes=null;data.guarantorCredit={credit_score:'750',credit_check_completed:1,credit_check_date:'2026-10-04'};
  data.creditDocument={id:900199,doc_type:'Credit Check Report',original_name:'TEST ONLY - Guarantor credit report.pdf',review_status:'approved',mime_type:'application/pdf'};
  for(const record of Object.values(data.records)){record.credit_check_completed=1;record.credit_score='750';record.credit_check_date='2026-10-04';data.documents[record.id]=[...(data.documents[record.id]||[]).filter(d=>d.doc_type!=='Credit Check Report'),{id:910000+record.id,doc_type:'Credit Check Report',original_name:'TEST ONLY - Tenant credit report.pdf',review_status:'approved',mime_type:'application/pdf'}];}
  data.agreementTestDefaults={permittedOccupiers:'And your children',sharedFacilities:'Shared driveway at the front of the property',parking:'None'};data.agreementTestReady=true;saveGuar(g);save();
 }

 localStorage.setItem('token','isolated-crm-preview');localStorage.setItem('fleming-last-activity',Date.now());localStorage.setItem('fleming-theme','light');
 const link=document.createElement('link');link.rel='stylesheet';link.href='/preview-banner.css';document.head.append(link);
 const banner=()=>{const label=document.createElement('div');label.className='crm-preview-label';label.textContent='CRM TEST · Fictional records · No messages sent';document.body.append(label)};document.body?banner():document.addEventListener('DOMContentLoaded',banner);
 if(location.pathname==='/')history.replaceState(null,'','/enquiries/84?onboarding=1'+location.search.replace(/^\?/,'&'));
 const docsFor=g=>Object.entries(g.uploads||{}).map(([index,file])=>{const i=Number(index);return {id:900100+i,entity_type:'tenant_enquiry',entity_id:9001,doc_type:['Primary Identification','Secondary Identification','Bank Statements','Proof of Income or Employment','Employment Reference'][i],original_name:file.name,review_status:data.documentReviews[900100+i]?.status||'pending',review_notes:data.documentReviews[900100+i]?.notes||'',mime_type:file.type};}).concat(data.creditDocument?[data.creditDocument]:[]);
 const guarRecord=g=>({applicant_type:'guarantor',...data.guarantorCredit,id:9001,first_name_1:g.form.name||g.contact.name,last_name_1:'',email_1:g.contact.email,phone_1:g.contact.phone,application_form_completed:g.signed?1:0,application_review_status:data.reviewStatus||'pending',application_section_reviews:data.reviews||{},application_form_slug:'preview',application_form_url:invitationLink('apply'),app_form_data:{first_name:g.form.name,email:g.form.email,date_of_birth:g.form.dob,current_address:g.form.address,employment_status:g.form.employment,employer_name:g.form.employer,job_title:g.form.jobTitle,employment_start_date:g.form.employmentStart,employer_department:g.form.department,employer_address:[g.form.employerAddressLine1,g.form.employerCity,g.form.employerPostcode].filter(Boolean).join(', '),business_type:g.form.businessType,business_name:g.form.businessName,business_address:[g.form.businessAddressLine1,g.form.businessCity,g.form.businessPostcode].filter(Boolean).join(', '),years_trading:g.form.yearsTrading,company_number:g.form.companyNumber,contractor_length:g.form.contractLength,self_assessments:g.form.selfAssessments,employment_pension_provider:g.form.pensionProvider,employment_pension_type:g.form.pensionType,student_institution:g.form.institution,student_course:g.form.course,student_address:g.form.institutionAddress,student_graduation_year:g.form.graduationYear,employment_circumstances:g.form.circumstances,employment_funding_source:g.form.incomeSource,additional_income:g.form.additionalIncome,additional_income_details:g.form.additionalIncomeDetails,employment_further_information:g.form.employmentFurtherDetails,employment_has_further_information:g.form.employmentFurtherInfo,provide_accountant_details:g.form.provideAccountant,accountant_details:g.form.accountantDetails,has_loans:g.form.hasLoans,loans:g.form.loanDetails,has_credit_cards:g.form.hasCreditCards,credit_cards:g.form.creditCardDetails,legal_proceedings:g.form.legalProceedings,legal_proceedings_details:g.form.legalDetails,bank_account_name:g.form.bankAccountName,bank_sort_code:g.form.bankSort,bank_account_number:g.form.bankAccount,employment_reference_available:g.form.hasEmployerReference,employment_reference_employee_id:g.form.employeeId,employment_reference_phone:g.form.referencePhone,employment_reference_contact_authority:g.form.referenceAuthority,annual_income:g.form.income,personal_reference_available:g.form.hasPersonalReference,personal_referee_name:g.form.personalReferenceName,personal_referee_phone:g.form.personalReferencePhone,personal_referee_email:g.form.personalReferenceEmail,personal_referee_address:g.form.personalReferenceAddress,employment_reference_name:g.form.reference,employment_reference_email:g.form.referenceEmail},application_changes_sent_at:data.changesSent,application_review_request:data.changes});
 const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 const log=(text)=>{data.activity.push({id:Date.now(),action:text,user_name:'Preview Administrator',created_at:new Date().toISOString(),entity_type:'tenant_enquiry',entity_id:84});save()};
 const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const sms=(g,witness=false)=>{
  const enquiry=data.records[84],partner=data.records[enquiry.joint_partner_id];
  const tenants=[enquiry,partner].filter(Boolean).map(r=>[r.first_name_1,r.last_name_1].filter(Boolean).join(' ')).join(' and ');
  if(witness)return {to:g.form.witnessPhone,text:`Hi there ${(g.form.witnessName||'').trim().split(/\s+/)[0]}, ${g.form.name||g.contact.name} has nominated you as the witness to their signature on a Deed of Guarantee for ${tenants}'s tenancy with Fleming Lettings. We have just sent important information to your nominated email address. If you have not received this, please call our office on 01902 212 415.`};
  const firstName=g.contact.name.trim().split(/\s+/)[0];
  return {to:g.contact.phone,text:`Hi there ${firstName}, you have been nominated to support ${tenants} as a guarantor on their tenancy agreement with Fleming Lettings. We have just sent you important information to your nominated email address provided by the ${partner?'tenants':'tenant'}. If you have not received this, please call our office on 01902 212 415.`};
 };
 const invitationLink=stage=>{const params=new URLSearchParams();if(scenarioName)params.set('scenario',scenarioName);if(previewRun)params.set('run',previewRun);return location.origin+'/guarantor/index.html'+(params.size?'?'+params:'')+'#'+stage;};
 const email=async(g,witness=false)=>{
  let html=await nativeFetch('/guarantor/'+(witness?'witness':'guarantor')+'-email.html').then(r=>r.text());
  const enquiry=data.records[84],partner=data.records[enquiry.joint_partner_id];
  const tenants=[enquiry,partner].filter(Boolean).map(r=>[r.first_name_1,r.last_name_1].filter(Boolean).join(' ')).join(' and ');
  const signedTime=g.signed?.at?new Date(g.signed.at).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'long',timeStyle:'short'}):'After guarantor signing';
  html=html.replaceAll('ROBIN_NAME',escape(g.form.name||g.contact.name)).replaceAll('MORGAN_NAME',escape(g.form.witnessName||'your witness')).replaceAll('SIGNED_TIME',escape(signedTime)).replaceAll('Jamie Taylor and Casey Taylor',escape(tenants))
   .replace(/href="(?:\.\/index\.html)?#(apply|witness)"/g,(_,stage)=>'href="'+invitationLink(stage)+'"');
  html=html.replaceAll('24 Example Gardens, Wolverhampton, WV10 9TG',escape([enquiry.property_address,enquiry.property_postcode].filter(Boolean).join(', '))).replaceAll('£1,000',Number(enquiry.monthly_rent_agreed||0).toLocaleString('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}));
  html=html.replaceAll('FIRSTNAME',escape((g.form.witnessName||'').split(/\s+/)[0])).replaceAll('GUARANTORNAME',escape(g.form.name||g.contact.name)).replaceAll('TENANTNAMES',escape(tenants)).replaceAll('PROPERTYADDRESS',escape(enquiry.property_address+', '+enquiry.property_postcode)).replaceAll('WITNESS_LINK',invitationLink('witness')).replace(/href="(?:X_LINK|LINKEDIN_LINK|YOUTUBE_LINK|UNSUBSCRIBE_LINK)"/g,'aria-disabled="true"');
  html=html.replaceAll('>Tenants<',partner?'>Tenants<':'>Tenant<');
  if(!witness&&!partner)html=html.replaceAll('have asked you','has asked you');
  return {subject:witness?'Witness attestation from Fleming Lettings':'Guarantor request from Fleming Lettings',html,to:witness?g.form.witnessEmail:g.contact.email};
 };
 const completedDeedEmail=async g=>{
  if(!g.signed||!g.witnessed||g.deedNeedsResigning||!g.completionEmail?.attachment?.key)throw Error('Both signatures and the completed PDF are required first.');
  const {getFile}=await import('/guarantor/file-store.mjs');const file=await getFile(g.completionEmail.attachment.key);
  if(!file||new TextDecoder().decode((await file.arrayBuffer()).slice(0,5))!=='%PDF-')throw Error('The completed signed attachment is unavailable.');
  const record=data.records[84],partner=data.records[record.joint_partner_id];
  let html=await nativeFetch('/guarantor/completed-deed-email.html').then(r=>r.text());
  const tenancyStart=String(g.tenancyStartDate||record.app_form_data?.tenancy_start_date||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(tenancyStart)||!Number.isFinite(Date.parse(tenancyStart)))throw Error('The tenancy start date is required for the completion email.');
  const values={TENANT_LABEL:partner?'Tenants':'Tenant',GUARANTOR_LABEL:'Guarantor',TENANCY_START_DATE:new Date(tenancyStart+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}),FIRST_NAME:(g.form.name||g.contact.name).trim().split(/\s+/)[0],GUARANTOR_NAME:g.form.name||g.contact.name,WITNESS_NAME:g.form.witnessName,TENANT_NAMES:[record,partner].filter(Boolean).map(r=>[r.first_name_1,r.last_name_1].filter(Boolean).join(' ')).join(' and '),PROPERTY_SHORT_ADDRESS:record.property_address,PROPERTY_ADDRESS_REMAINDER:record.property_postcode,COMPLETED_DATE:new Date(g.witnessed.at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'})};
  for(const [key,value]of Object.entries(values))html=html.replaceAll('{{'+key+'}}',escape(value));
  return {...g.completionEmail,subject:'Your completed Deed of Guarantee',html};
 };
 const complianceDocuments=()=>data.propertyDocuments||[
  {id:930001,doc_type:'EPC',original_name:'TEST ONLY - EPC.pdf',expiry_date:'2036-09-01'},
  {id:930002,doc_type:'EICR',original_name:'TEST ONLY - EICR.pdf',expiry_date:'2031-09-01'},
  {id:930003,doc_type:'Gas Safety Certificate',original_name:'TEST ONLY - Gas Safety Certificate.pdf',expiry_date:'2027-09-01'},
  {id:930004,doc_type:'How to Rent Guide',original_name:'TEST ONLY - How to Rent Guide.pdf',expiry_date:null},
  {id:930005,doc_type:'Renters Rights Information',original_name:'TEST ONLY - Renters Rights Information.pdf',expiry_date:null}
 ];

 const agreementInput=a=>{const record=data.records[84],property=seed.properties.find(p=>p.id===record.linked_property_id)||seed.properties[0],d=a.agreement_details,internal=a.agreement_type==='internal',partner=data.records[record.joint_partner_id];return {enquiryId:84,agreementType:a.agreement_type,serviceType:property.service_type,agreementDate:a.issued_at,tenancyStartDate:d.tenancyStartDate,rent:Number(d.rent),deposit:Number(d.deposit),propertyAddress:[record.property_address,record.property_postcode].filter(Boolean).join(', '),hasGas:true,landlord:{name:internal?'Fleming Lettings & Developments UK Limited':property.landlord_name,address:internal?'Creative Industries Centre, Glaisher Drive, Wolverhampton Science Park, Wolverhampton, WV10 9TG':property.landlord_address||'Test landlord address',email:'landlord@example.test'},holdingDeposit:record.source_tenant_id?0:Number(record.holding_deposit_received_amount||0),depositScheme:'Tenancy Deposit Scheme',tenants:[record,partner].filter(Boolean).map(r=>({name:[r.first_name_1,r.last_name_1].join(' '),email:r.email_1,phone:r.phone_1,address:r.current_address||'Test address'})),permittedOccupiers:d.permittedOccupiers,sharedFacilities:d.sharedFacilities,parking:d.parking,paymentReference:d.paymentReference,bankDetails:internal?companyBanks.operatingAccount:companyBanks.clientAccount,paymentRoute:internal?'fleming_operating':'fleming_client_money',complianceDocuments:['EPC','EICR','Gas Safety Certificate']};};
 const bytesBase64=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
 const renderAgreement=async(a,signers,completed=false)=>{
  const {getFile,putFile}=await import('/guarantor/file-store.mjs');let source;
  if(a.sourcePdfKey&&(a.rendererVersion===5||a.tenant_signed_at||a.joint_tenant_signed_at||a.landlord_signed_at)){const file=await getFile(a.sourcePdfKey);if(file)source=await bytesBase64(file);}
  const response=await nativeFetch('/preview-agreement-render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:agreementInput(a),source,signers:signers||{},completed})});
  if(!response.ok)throw Error((await response.json()).error||'Agreement could not be generated');
  let blob=await response.blob();
  if(!source&&!signers){const {PDFDocument}=await import('/guarantor/pdf-lib.esm.min.js');const pdfDoc=await PDFDocument.load(await blob.arrayBuffer());for(const label of ['EPC','EICR','Gas Safety Certificate']){const sample=await PDFDocument.load(await pdf(label).arrayBuffer());for(const page of await pdfDoc.copyPages(sample,sample.getPageIndices()))pdfDoc.addPage(page);}blob=new Blob([await pdfDoc.save()],{type:'application/pdf'});a.sourcePdfKey=crypto.randomUUID();a.pdfKey=a.sourcePdfKey;a.rendererVersion=5;await putFile(a.sourcePdfKey,blob);}
  return blob;
 };
 const currentAgreementPdf=async a=>{const {getFile}=await import('/guarantor/file-store.mjs'),file=a.pdfKey?await getFile(a.pdfKey):null,signed=a.tenant_signed_at||a.joint_tenant_signed_at||a.landlord_signed_at||a.status==='completed';if(signed){if(!file)throw Error('The saved signed test agreement is unavailable. Edit and reissue a new test copy.');return file;}if(a.rendererVersion!==5||!file){await renderAgreement(a);if(data.agreement?.id===a.id)Object.assign(data.agreement,a);save();}return getFile(a.pdfKey);};
 const agreementLink=(role='tenant',id=data.agreement?.id)=>{const params=new URLSearchParams();for(const key of ['scenario','run']){const value=new URLSearchParams(location.search).get(key);if(value)params.set(key,value);}params.set('role',role);if(id)params.set('agreement',String(id));return location.origin+'/guarantor/agreement-test.html?'+params;};
 const agreementEmail=async(record,body)=>{
  const property=seed.properties.find(p=>p.id===record.linked_property_id)||seed.properties[0],internal=property.landlord_type==='internal',address=[record.property_address,record.property_postcode].filter(Boolean).join(', '),rent=Number(body.rent||record.monthly_rent_agreed||0),deposit=Number(body.deposit||record.security_deposit_amount||0),funds=record.source_tenant_id?0:Number(record.holding_deposit_received_amount||record.holding_deposit_amount||0),start=body.tenancy_start_date||record.app_form_data?.tenancy_start_date,signingUrl=agreementLink(),money=v=>Number(v).toLocaleString('en-GB',{maximumFractionDigits:2});
  if(body.editing_agreement_id){const response=await nativeFetch('/preview-agreement-notice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:record.first_name_1,address,url:signingUrl,waitingForLandlord:!internal})});if(!response.ok)throw Error('Revision notice could not be prepared');return {...await response.json(),to:record.email_1};}
  const message=String(body.email_message||'Your tenancy agreement for {{property_address}} is ready to review and sign.').replaceAll('{{first_name}}',record.first_name_1).replaceAll('{{property_address}}',address).replaceAll('{{signing_link}}',signingUrl);
  const response=await nativeFetch('/preview-agreement-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:record.first_name_1,propertyAddress:address,tenancyStartDate:start||'2026-11-06',landlordName:internal?'Fleming Lettings & Developments UK Limited':property.landlord_name,landlordAddress:internal?'Creative Industries Centre, Glaisher Drive, Wolverhampton Science Park, Wolverhampton, WV10 9TG':property.landlord_address,monthlyRent:rent,securityDeposit:deposit,fundsOnAccount:funds,balanceDue:Math.max(0,rent+deposit-funds),signingUrl,customMessage:message,isExistingTenant:!!record.source_tenant_id})});
  if(!response.ok)throw Error('Agreement email could not be prepared');const result=await response.json();return {...result,body_html:result.html,to:record.email_1,simulated:true};
 };
 const recordAgreementDelivery=async(record,body,action='sent',at=new Date().toISOString())=>{
  const a=data.agreement,d=a.agreement_details;
  if(body.send_email){const message=await agreementEmail(record,{tenancy_start_date:d.tenancyStartDate,rent:d.rent,deposit:d.deposit,...body});data.agreementEmails=[...(data.agreementEmails||[]),{id:crypto.randomUUID(),agreement_id:a.id,action,subject:message.subject,to_email:record.email_1,body_html:message.body_html||message.html,status:'simulated',created_at:at,template:'tenancy_agreement'}];}
  if(body.send_sms){data.agreementSms=[...(data.agreementSms||[]),{id:crypto.randomUUID(),agreement_id:a.id,channel:'sms',direction:'outbound',recipient:record.phone_1,body:`Hi ${record.first_name_1}, your tenancy agreement is ready to review and sign: ${agreementLink()}`,status:'simulated',created_at:at}];}
 };
 const reviewEmail=async(g,record=guarRecord(g),changes)=>{
  const isGuarantor=record.id===9001;
  const reviews=isGuarantor?data.reviews:record.application_section_reviews;
  const documents=isGuarantor?docsFor(g):data.documents[record.id]||[];
  const lines=changes||[...Object.entries(reviews||{}).filter(([,r])=>r.status==='rejected').map(([title,r])=>title+': '+r.reason),...documents.filter(d=>d.review_status==='rejected').map(d=>d.doc_type+': '+d.review_notes)].join('\n\n');
  let html=await nativeFetch('/guarantor/application-review-email.html').then(r=>r.text());
  const applicationUrl=isGuarantor?invitationLink('apply'):record.application_form_url||'http://127.0.0.1:8989/application.html?token=preview';
  html=html.replaceAll('{{FIRST_NAME}}',escape((record.first_name_1||'').trim().split(/\s+/)[0])).replaceAll('{{REQUESTED_CHANGES}}',escape(lines).replaceAll('\n','<br>')).replaceAll('{{APPLICATION_URL}}',escape(applicationUrl));
  if(isGuarantor)html=html.replace('completing your application forms','completing your guarantor application');
  return {to:record.email_1,subject:'More information required for your '+(isGuarantor?'guarantor ':'')+'application',html};
 };
 const pdf=label=>{const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];const stream=`BT /F1 18 Tf 50 780 Td (FICTIONAL TEST DOCUMENT) Tj 0 -36 Td /F1 12 Tf (${String(label).replace(/[^a-zA-Z0-9 .-]/g,'')}) Tj 0 -28 Td (No real identity, financial or legal evidence.) Tj ET`;objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);let s='%PDF-1.4\n',offset=[0];objects.forEach((o,i)=>{offset.push(s.length);s+=`${i+1} 0 obj\n${o}\nendobj\n`});const at=s.length;s+=`xref\n0 6\n0000000000 65535 f \n`+offset.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${at}\n%%EOF`;return new Response(s,{headers:{'Content-Type':'application/pdf'}})};
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url||String(input),location.origin),p=url.pathname,method=options.method||'GET';
  if(!p.startsWith('/api/'))return nativeFetch(input,options);
  try{data=JSON.parse(localStorage.getItem(dataKey))||data}catch{}
  let body={};try{body=typeof options.body==='string'?JSON.parse(options.body):options.body||{}}catch{}
  let g=readGuar();
  if(seed.records[84]?.source_tenant_id&&!data.records[84].source_tenant_id){data.records[84].source_tenant_id=seed.records[84].source_tenant_id;save();}
  try{
   if(g.witnessed&&g.completionEmail?.attachment&&data.records[84]?.source_tenant_id){
    const attachment=g.completionEmail.attachment;data.tenantDocuments??=[];
    if(!data.tenantDocuments.some(doc=>doc.file_key===attachment.key)){const {getFile}=await import('/guarantor/file-store.mjs');const file=await getFile(attachment.key);if(file){data.tenantDocuments.push({id:910000+data.tenantDocuments.length,entity_type:'tenant',entity_id:data.records[84].source_tenant_id,doc_type:'Guarantor Documents',original_name:'Deed of Guarantee - '+(g.form.name||g.contact.name)+' - signed.pdf',mime_type:'application/pdf',size:file.size,uploaded_at:g.witnessed.at,file_key:attachment.key});save();}}
   }

   if(p.startsWith('/api/public/tenancy-agreements/')){
    const a=data.agreement,parts=p.split('/'),version=parts[4],action=parts[5],role=new URLSearchParams(location.search).get('role')||'tenant';
    if(!a)throw Error('No test agreement has been issued yet.');
    if(version!=='current'&&String(a.id)!==version)throw Error('This agreement has been replaced. Please use the latest invitation.');
    if(!['tenant','joint_tenant','landlord'].includes(role)||role==='joint_tenant'&&!a.requires_joint_tenant_signature||role==='landlord'&&!a.requires_landlord_signature)throw Error('This signing link is invalid.');
    if(role!=='landlord'&&a.requires_landlord_signature&&!a.landlord_signed_at)throw Error('The landlord must sign before the tenant invitation is available.');
    if(action==='pdf')return new Response(await currentAgreementPdf(a),{headers:{'Content-Type':'application/pdf'}});
    if(action==='preview'||action==='sign'){
     await currentAgreementPdf(a);
     if(a[role+'_signed_at'])throw Error('This agreement has already been signed.');
     if(!/^data:image\/png;base64,/.test(body.signature||''))throw Error('Please provide a signature.');
     if(action==='sign'&&(!body.accepted_terms||!body.accepted_binding||!body.accepted_payment_schedule||body.signature_name!==a[role+'_name']))throw Error('Confirm your name and all signing declarations.');
     const signers={...(a.testSignatures||{}),[role]:{name:a[role+'_name'],at:new Date().toISOString(),image:body.signature}};
     const completed=!!signers.tenant&&(!a.requires_joint_tenant_signature||!!signers.joint_tenant)&&(!a.requires_landlord_signature||!!signers.landlord);
     const blob=await renderAgreement(a,signers,action==='sign'&&completed);
     if(action==='preview')return new Response(blob,{headers:{'Content-Type':'application/pdf'}});
     const {putFile}=await import('/guarantor/file-store.mjs');a.pdfKey=crypto.randomUUID();await putFile(a.pdfKey,blob);a.testSignatures=signers;a[role+'_signed_at']=signers[role].at;a.status=completed?'completed':a.requires_landlord_signature&&!signers.landlord?'awaiting_landlord':'awaiting_tenant';
     if(completed){a.completed_at=signers[role].at;data.records[84].tenancy_agreement_signed=1;data.tenantDocuments??=[];data.tenantDocuments.push({id:940000+data.tenantDocuments.length,entity_type:'tenant',entity_id:data.records[84].source_tenant_id||84,doc_type:'Tenancy Agreement',original_name:'TEST ONLY - Signed Tenancy Agreement.pdf',mime_type:'application/pdf',file_key:a.pdfKey,uploaded_at:a.completed_at});}
     save();return response({success:true,simulated:true});
    }
    a[role+'_opened_at']=new Date().toISOString();save();return response({status:a.status,signer_role:role,signer_name:a[role+'_name'],signer_signed:!!a[role+'_signed_at'],property_address:agreementInput(a).propertyAddress,today:new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'}),outstanding_signers:['tenant',...(a.requires_joint_tenant_signature?['joint_tenant']:[]),...(a.requires_landlord_signature?['landlord']:[])].filter(key=>!a[key+'_signed_at']).map(key=>a[key+'_name'])});
   }
   if(p.startsWith('/api/preview/tenant-documents/'))return response((data.tenantDocuments||[]).filter(doc=>doc.entity_id===Number(p.split('/').pop())));
   const downloadId=p.match(/^\/api\/documents\/download\/(\d+)$/);if(downloadId){const id=Number(downloadId[1]),doc=[...(data.tenantDocuments||[]),...Object.values(data.documents).flat(),...complianceDocuments(),data.creditDocument].filter(Boolean).find(doc=>doc.id===id),key=doc?.file_key||doc?.fileKey||g.uploads?.[id-900100]?.key;if(!key)return pdf(doc?.original_name||'Test evidence '+id);const {getFile}=await import('/guarantor/file-store.mjs');const file=await getFile(key);if(!file)throw Error('The saved document is unavailable in this browser.');return new Response(file,{headers:{'Content-Type':doc?.mime_type||file.type||'application/pdf'}});}
   if(p==='/api/auth/me')return response({user:seed.user});
   if(p==='/api/preview/guarantor'){
    if(method==='POST'){
     if(body.action==='tenancy-date'){
      if(g.status!=='draft'||g.invitationDelivery||g.signed)throw Error('Tenancy details are locked once the guarantor request has been sent.');
      const value=String(body.value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Choose a valid tenancy start date.');
      const previous=data.records[84].app_form_data.tenancy_start_date;
      if(previous!==value){
       for(const record of Object.values(data.records))record.app_form_data={...record.app_form_data,tenancy_start_date:value};
       g.tenancyStartDate=value;
       save();
      }
     }else if(body.action==='reset'){
      data.guarantorHistory=[...(data.guarantorHistory||[]),{guarantor:g,reviews:data.reviews,documentReviews:data.documentReviews,creditDocument:data.creditDocument,guarantorCredit:data.guarantorCredit,reviewStatus:data.reviewStatus,resetAt:new Date().toISOString()}];
      g={...initialState(),contact:g.contact,events:[...g.events,{action:'reset',at:new Date().toISOString()}]};
      Object.assign(data,{reviews:{},documentReviews:{},reviewStatus:'pending',creditDocument:null,guarantorCredit:null,changes:null,changesSent:null});
     }else if(body.action==='resend'){
      if(body.witness){if(!g.signed||g.witnessed||g.status!=='awaiting_witness'||(!body.sendEmail&&!body.sendSms))throw Error('Choose a delivery method while awaiting witness attestation.');if(body.sendSms&&!g.form.witnessPhone)throw Error('A witness phone number is required for SMS.');}
      else if(g.status==='draft'||g.signed||(!body.sendEmail&&!body.sendSms))throw Error('Choose a delivery method for an outstanding guarantor invitation.');
      g.lastResent={at:new Date().toISOString(),witness:!!body.witness,email:!!body.sendEmail,sms:!!body.sendSms,smsMessage:body.sendSms?sms(g,body.witness):null,simulated:true};
      g.events.push({action:body.witness?'witness_invitation_resent':'invitation_resent',...g.lastResent});
     }else if(body.action==='verify'){
      if(g.deedNeedsResigning)throw Error('Arrange a new deed signing after the identity or address change.');
      if(!g.witnessed||!g.signed||data.reviewStatus!=='approved'||docsFor(g).filter(d=>d.id>=900100&&d.id<900104).length<4||docsFor(g).some(d=>d.review_status!=='approved')||!['Identity and address verified',...((['Employed','Part-time Employed'].includes(g.form.employment)||(g.form.employment==='Self-Employed'&&g.form.hasEmployerReference==='Yes'))?['Employment reference verified']:g.form.hasPersonalReference==='Yes'&&[g.form.personalReferenceName,g.form.personalReferencePhone,g.form.personalReferenceEmail,g.form.personalReferenceAddress].some(value=>String(value||'').trim())?['Personal reference verified']:[]),'Financial evidence reviewed','Deed and witness evidence reviewed'].every(check=>body.checks?.includes(check)))throw Error('Complete both signatures, approve the application and evidence, before continuing to Credit Check.');
      g.status='verified';g.events.push({action:'verified',at:new Date().toISOString()});
     }else{
      if(body.action==='require'&&Object.values(data.records).some(r=>!r.application_form_completed||r.application_review_status!=='approved'))throw Error('Approve both tenant applications first.');
      if(body.action==='invite'&&body.sendEmail===false)throw Error('The application email must be included with this invitation.');
      if(body.action==='restart'){g.previousDeeds=[...(g.previousDeeds||[]),{html:g.signedDocument,signed:g.signed,witnessed:g.witnessed,witnessSignatureImage:g.witnessSignatureImage}];g.deedNeedsResigning=false;g.signedDocument=null;g.signatureImage=null;g.witnessSignatureImage=null;}
      g=transition(g,body.action,body);
      if(body.action==='invite')g.invitationDelivery={email:true,sms:body.sendSms===true,smsMessage:body.sendSms===true?sms(g):null,at:new Date().toISOString(),simulated:true};
     }
     saveGuar(g);log('Guarantor '+body.action);
    }
    const primary=data.records[84],partner=data.records[primary.joint_partner_id];
    return response({...g,record:guarRecord(g),documents:docsFor(g),tenancy:{tenants:[primary,partner].filter(Boolean).map(r=>r.first_name_1+' '+r.last_name_1).join(' & '),property:primary.property_address+', '+primary.property_postcode,startDate:primary.app_form_data.tenancy_start_date,rent:primary.monthly_rent_agreed,deposit:primary.security_deposit_amount}});
   }
   if(p==='/api/preview/guarantor/email-preview'){const result=await email(g,body.witness);result.html=result.html.replaceAll('./index.html#apply',location.origin+'/guarantor/index.html#apply').replaceAll('./index.html#witness',location.origin+'/guarantor/index.html#witness');return response(result)}
   if(p==='/api/preview/guarantor/completion-email')return response(await completedDeedEmail(g));if(p==='/api/preview/guarantor/completed-copy'){if(!g.completionEmail)throw Error('Both signatures are required first.');const {getFile}=await import('/guarantor/file-store.mjs');const file=await getFile(g.completionEmail.attachment.key);if(!file)throw Error('The signed test attachment is unavailable in this browser.');return new Response(file,{headers:{'Content-Type':'application/pdf'}});}if(p==='/api/preview/guarantor/sms-preview')return response(sms(g,body.witness));
   if(p==='/api/preview/guarantor/credit-report'){
    const file=body.get?.('file');if(!file)throw Error('Choose a credit report.');if(file.size>5e6)throw Error('Use a test report smaller than 5 MB.');
    data.creditDocument={id:900199,doc_type:'Credit Check Report',original_name:file.name,review_status:'pending',entity_id:9001,mime_type:file.type||'application/pdf'};save();return response({success:true});
   }
   if(p==='/api/tenant-enquiries')return response(Object.values(data.records));
   const recordMatch=p.match(/^\/api\/tenant-enquiries\/(\d+)(?:\/(.*))?$/);
   if(recordMatch){const id=+recordMatch[1],action=recordMatch[2],record=id===9001?guarRecord(g):data.records[id];if(!record)return response({error:'Test record not found'},404);
    if(!action){if(method==='PUT'){Object.assign(record,body);save();}return response(record)}
    if(action==='convert'&&method==='POST'){
     const {completeReapplication}=await import('/reapplication-lifecycle.mjs');
     const result=completeReapplication(data,g);save();return response({success:true,tenant_id:999,simulated:true,changeover:result});
    }
    if(action==='credit-check'&&method==='POST'){
     if(!record.application_form_completed||record.application_review_status!=='approved')throw Error('Approve this applicant’s application before recording their credit check.');
     const score=String(body.get?.('score')||'').trim(),file=body.get?.('report');
     if(!/^\d+$/.test(score)||!Number.isSafeInteger(Number(score)))throw Error('Enter a valid credit score.');
     if(!file||!file.size||file.size>10*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type))throw Error('Upload a PDF, JPG or PNG credit report up to 10 MB.');
     const result=JSON.parse(body.get('result')||'{}'),{putFile}=await import('/guarantor/file-store.mjs'),fileKey=crypto.randomUUID(),at=new Date().toISOString();
     await putFile(fileKey,file);
     const document={id:910000+id,entity_type:'tenant_enquiry',entity_id:id,doc_type:'Credit Check Report',original_name:file.name,mime_type:file.type,size:file.size,fileKey,uploaded_at:at,review_status:'approved',credit_check_result:{...result,score}};
     const credit={credit_score:score,credit_check_completed:1,credit_check_date:at.slice(0,10),credit_check_result:result};
     if(id===9001){document.id=900199;data.creditDocument=document;data.guarantorCredit=credit;}
     else {data.documents[id]=[...(data.documents[id]||[]).filter(doc=>doc.doc_type!=='Credit Check Report'),document];Object.assign(record,credit);}
     save();log('Credit check saved for '+record.first_name_1+' '+record.last_name_1);return response({success:true,simulated:true});
    }
    if(action==='onboarding-activity'||action==='onboarding-view')return response({last_viewed_at:new Date().toISOString(),last_progressed_by:'Preview Administrator'});
    if(action==='holding-deposit-payments')return response({matches:[],linked:[]});
    if(action==='balance-transactions'||action==='balance-matches')return response([]);
    if(action==='client-agreement-details')return response({enabled:false,serviceAgreementReady:true});
    if(action==='tenancy-agreement'){
     if(method==='GET')return response(data.agreement||null);
     const partner=data.records[record.joint_partner_id];
     if(record.application_review_status!=='approved'||!record.credit_check_completed||(partner&&(!partner.credit_check_completed||partner.application_review_status!=='approved'))||(g.required&&g.status!=='verified'))throw Error('Complete the application, guarantor review and credit checks first.');
     if(['tenancy_start_date','rent','deposit','permitted_occupiers','shared_facilities','parking','payment_reference'].some(key=>!String(body[key]??'').trim()))throw Error('Complete all agreement particulars and the payment reference.');
     if(!body.send_email&&!body.send_sms)throw Error('Choose email or SMS for the invitation.');
     if(complianceDocuments().some(doc=>doc.expiry_date&&doc.expiry_date<new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'})))throw Error('Property compliance documents must be in date.');
     if(body.editing_agreement_id&&Number(body.editing_agreement_id)!==data.agreement?.id)throw Error('The agreement has changed. Reload before saving your edits.');
     const property=seed.properties.find(p=>p.id===record.linked_property_id)||seed.properties[0],internal=property.landlord_type==='internal',at=new Date().toISOString(),firstName=record.first_name_1,tenantName=[firstName,record.last_name_1].join(' '),bank=internal?companyBanks.operatingAccount:companyBanks.clientAccount;
     const details={tenancyStartDate:body.tenancy_start_date,rent:Number(body.rent),deposit:Number(body.deposit),permittedOccupiers:body.permitted_occupiers,sharedFacilities:body.shared_facilities,parking:body.parking,paymentReference:body.payment_reference};
     const agreement={id:Date.now(),agreement_type:internal?'internal':'client',status:internal?'awaiting_tenant':'awaiting_landlord',original_name:'TEST ONLY - Tenancy Agreement - '+tenantName+'.pdf',issued_at:at,agreement_details:details,requires_landlord_signature:internal?0:1,requires_joint_tenant_signature:partner?1:0,tenant_name:tenantName,tenant_slug:null,joint_tenant_name:partner?[partner.first_name_1,partner.last_name_1].join(' '):null,joint_tenant_slug:null,landlord_name:property.landlord_name,landlord_slug:null,tenant_delivery_email:body.send_email?1:0,tenant_delivery_sms:body.send_sms?1:0,tenant_delivery_sent_at:at,simulated:true};
     agreement.tenant_slug=agreementLink('tenant',agreement.id);agreement.joint_tenant_slug=partner?agreementLink('joint_tenant',agreement.id):null;agreement.landlord_slug=internal?null:agreementLink('landlord',agreement.id);await renderAgreement(agreement);
     if(data.agreement)data.agreementHistory=[...(data.agreementHistory||[]),data.agreement];data.agreement=agreement;record.tenancy_agreement_sent=1;await recordAgreementDelivery(record,body,body.editing_agreement_id?'revised':'sent',at);save();log('Test tenancy agreement issued');return response({id:agreement.id,delivery:{tenant:{success:true,simulated:true}}});
    }
    if(action==='tenancy-agreement/pdf'){if(!data.agreement)throw Error('Generate the test agreement first.');return new Response(await currentAgreementPdf(data.agreement),{headers:{'Content-Type':'application/pdf'}});}
    if(action==='tenancy-agreement/resend'){if(!data.agreement)throw Error('Generate the test agreement first.');const at=new Date().toISOString();await recordAgreementDelivery(record,{send_email:!!data.agreement.tenant_delivery_email,send_sms:!!data.agreement.tenant_delivery_sms},'resent',at);data.agreement.tenant_delivery_sent_at=at;save();return response({delivery:{tenant:{success:true,simulated:true}}});}
    if(action==='tenancy-agreement/email-preview')return response(await agreementEmail(record,body));
    if(action==='tenancy-agreement-compliance'){
     const property=seed.properties.find(p=>p.id===record.linked_property_id)||seed.properties[0],internal=property.landlord_type==='internal',partner=data.records[record.joint_partner_id],jointApplicantsReady=!partner||!!(partner.application_form_completed&&partner.application_review_status==='approved'&&partner.credit_check_completed),documents=complianceDocuments();
     const items=documents.map(doc=>({docType:doc.doc_type,label:doc.doc_type,expiryDate:doc.expiry_date,ready:!doc.expiry_date||doc.expiry_date>=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'}),reason:doc.expiry_date&&doc.expiry_date<new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'})?'Document has expired':null,document:doc}));
     return response({items,attachments:documents,ready:items.every(item=>item.ready)&&jointApplicantsReady,propertyLinked:true,agreementType:internal?'internal':'client',serviceType:property.service_type,paymentRoute:internal?'fleming_operating':'fleming_client_money',initialPaymentAccount:internal?companyBanks.operatingAccount:companyBanks.clientAccount,landlordName:property.landlord_name,jointApplicantsReady,jointApplicant:partner?{name:[partner.first_name_1,partner.last_name_1].join(' '),applicationComplete:!!partner.application_form_completed,applicationApproved:partner.application_review_status==='approved',creditCheckComplete:!!partner.credit_check_completed}:null,defaults:{tenancyStartDate:record.app_form_data?.tenancy_start_date,rent:record.monthly_rent_agreed,deposit:record.security_deposit_amount,paymentReference:(String(record.property_address||'').match(/^\s*\d+[A-Za-z]?/)?.[0]?.trim()||'PROPERTY')+' '+String(record.property_postcode||'').replace(/\s/g,'').toUpperCase()+' - '+String(record.last_name_1||'TENANT').toUpperCase(),...(data.agreementTestDefaults||{})}});
    }
    if(action==='section-review'){
     if(body.status==='rejected'&&!body.reason?.trim())throw Error('Enter a rejection reason.');
     const reviews=id===9001?data.reviews:record.application_section_reviews;reviews[body.section]={status:body.status,reason:body.reason};if(id===9001)data.reviewStatus='pending';save();return response({success:true});
    }
    if(action==='application-review/email-preview')return response(await reviewEmail(g,record,body.changes_required));
    if(action==='application-review'){
     if(id===9001){if(body.status==='approved'&&(!g.signed||Object.values(data.reviews).length<1||Object.values(data.reviews).some(r=>r.status!=='approved')||docsFor(g).some(d=>d.review_status!=='approved')))throw Error('Approve every application section and supporting document first.');data.reviewStatus=body.status;data.changes=body.changes_required;data.changesSent=body.status==='changes_requested'&&(body.send_email||body.send_sms)?new Date().toISOString():null;if(data.changesSent){data.changes={message:body.changes_required,internal_notes:body.notes,requested_at:data.changesSent};if(body.send_email)data.changeRequestEmail={...await reviewEmail(g,record,body.changes_required),at:data.changesSent,simulated:true};data.changeRequestDelivery={email:!!body.send_email,sms:!!body.send_sms,at:data.changesSent,simulated:true};g.events.push({action:'changes_requested',at:data.changesSent});saveGuar(g);}}
     else {
      const sent=body.status==='changes_requested'&&(body.send_email||body.send_sms)?new Date().toISOString():null;
      const message=sent&&body.send_email?await reviewEmail(g,record,body.changes_required):null;
      Object.assign(record,{application_review_status:body.status,application_changes_sent_at:sent,application_review_request:body.status==='changes_requested'?{message:body.changes_required,internal_notes:body.notes,requested_at:sent}:null});
      if(sent){record.changeRequestDelivery={email:!!body.send_email,sms:!!body.send_sms,at:sent,simulated:true};if(message)record.changeRequestEmail={...message,at:sent,simulated:true};}
     }
     save();return response({success:true,delivery:{}});
    }
    if(method==='GET')return response([]);
   }
   const docList=p.match(/^\/api\/documents\/tenant_enquiry\/(\d+)$/);if(docList)return response(+docList[1]===9001?docsFor(g):data.documents[docList[1]]||[]);
   const docAction=p.match(/^\/api\/documents\/(\d+)\/(.*)$/);if(docAction){const id=+docAction[1],action=docAction[2];if(['download','view','file'].includes(action)){const stored=[...Object.values(data.documents).flat(),data.creditDocument].filter(Boolean).find(doc=>doc.id===id&&doc.fileKey);if(stored){const {getFile}=await import('/guarantor/file-store.mjs');const file=await getFile(stored.fileKey);if(!file)throw Error('Test report unavailable in this browser.');return new Response(file,{headers:{'Content-Type':stored.mime_type}});}const upload=g.uploads?.[id-900100];if(upload){const {getFile}=await import('/guarantor/file-store.mjs');const file=await getFile(upload.key);if(!file)throw Error('Test file unavailable in this browser.');return new Response(file,{headers:{'Content-Type':upload.type}});}return pdf('Test evidence '+id);}if(action==='review'){if(body.status==='rejected'&&!body.notes?.trim())throw Error('Enter a rejection reason.');data.documentReviews[id]={status:body.status,notes:body.notes};if(data.creditDocument?.id===id)Object.assign(data.creditDocument,{review_status:body.status,review_notes:body.notes});save();return response({success:true})}}
   if(p==='/api/properties')return response(data.properties);
   if(p==='/api/properties/26')return response(data.properties[0]);
   if(p==='/api/users/options'||p==='/api/users')return response([seed.user]);
   if(p==='/api/chat/whatsapp-status')return response({ready:false,number:'',message:'Test preview — WhatsApp is not connected here. Live Twilio approval status is not checked.'});
   if(p.startsWith('/api/chat/conversations')){
    data.chatConversations??=[{id:'test-whatsapp-open',kind:'whatsapp',title:'Example WhatsApp contact',status:'open',unread:0,assigned_to:101,visitor_phone:'+447700900123',last_message:'Test message — reply window ended',last_customer_message_at:'2026-01-01T10:00:00Z'},{id:'test-whatsapp-closed',kind:'whatsapp',title:'Example closed chat',status:'closed',unread:0,last_message:'Test conversation completed'}];
    data.chatMessages??={};
    if(p==='/api/chat/conversations'){
     if(method==='POST'){
      const names={101:'Jamie Taylor',102:'Casey Taylor',103:'Morgan Reed',104:'Alex Morgan'};
      if(!['direct','department','group'].includes(body.kind))throw Error('Choose a test colleague or department.');
      const row={id:crypto.randomUUID(),kind:body.kind,title:body.kind==='direct'?names[body.user_id]:body.department||body.title,direct_user_id:body.user_id,status:'open',unread:0};data.chatConversations.push(row);save();return response(row);
     }
     save();return response(data.chatConversations);
    }
    const parts=p.split('/'),row=data.chatConversations.find(c=>c.id===parts[4]);if(!row)return response({error:'Test conversation not found'},404);
    if(parts[5]==='messages'){
     if(method==='POST'){if(row.kind==='whatsapp')throw Error('WhatsApp messages cannot be sent from this test preview.');(data.chatMessages[row.id]??=[]).push({id:Date.now(),sender_id:seed.user.id,sender_name:seed.user.name,body:body.body,created_at:new Date().toISOString(),status:'sent',files:[]});row.last_message=body.body;save();}
     return response({conversation:row,messages:data.chatMessages[row.id]||[]});
    }
    if(parts[5]==='read')return response({success:true});
    if(method==='PUT'){Object.assign(row,{...(body.status?{status:body.status}:{}),...('assigned_to' in body?{assigned_to:body.assigned_to}:{})});save();return response(row);}
    if(method==='DELETE'){data.chatConversations=data.chatConversations.filter(c=>c.id!==row.id);save();return response({success:true});}
    return response(row);
   }
   if(p==='/api/chat/directory')return response({users:[{...seed.user,department:'Wolverhampton'},...[
    [101,'Jamie Taylor','Wolverhampton','JT'],[102,'Casey Taylor','Wolverhampton','CT'],[103,'Morgan Reed','Head Office','MR'],[104,'Alex Morgan','Birmingham','AM']
   ].map(([id,name,department,initials])=>({id,name,department,online:false,avatar_url:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#8f2e70"/><text x="32" y="40" text-anchor="middle" font-family="Arial" font-size="22" fill="white">${initials}</text></svg>`)}))],department:'Wolverhampton',departments:[{name:'Wolverhampton'},{name:'Head Office'},{name:'Birmingham'}]});
   if(p==='/api/notifications')return response({items:[]});
   if(p==='/api/feedback')return response({tickets:[]});
   if(p.startsWith('/api/activity/'))return response(data.activity);
   if(p==='/api/tenants/999/communications')return response([...(data.agreementEmails||[]).map(row=>({...row,channel:'email',direction:'outbound',recipient:row.to_email,sender:'Fleming Lettings (test preview)',body:row.body_html})),...(data.agreementSms||[])]);
   if(p.startsWith('/api/email-history/')){
    const rows=[...(data.agreementEmails||[])];
    for(const witness of [false,true]){if(g.status==='draft'||witness&&!g.signed)continue;const message=await email(g,witness);rows.push({id:witness?2:1,subject:message.subject,to_email:message.to,status:'simulated',created_at:witness?g.signed.at:g.events.find(e=>e.action==='invite')?.at,body_html:message.html});}
    return response(rows);
   }
   if(method==='GET')return response([]);
   if(p==='/api/activity'||p==='/api/chat/presence')return response({success:true});
   return response({error:'This action is outside the guarantor test. No live record was changed.'},400);
  }catch(e){return response({error:e.message},409)}
 };

 // Sent-stage comparisons open immediately; the original PDF is rendered on demand.
 if(new URLSearchParams(location.search).get('stage')==='agreement-sent'&&!data.agreement){
  const record=data.records[84],id=Date.now(),at=new Date().toISOString(),tenantName=[record.first_name_1,record.last_name_1].join(' ');
  data.agreement={id,agreement_type:'internal',status:'awaiting_tenant',original_name:'TEST ONLY - Tenancy Agreement - '+tenantName+'.pdf',issued_at:at,agreement_details:{tenancyStartDate:record.app_form_data?.tenancy_start_date||'2026-11-06',rent:Number(record.monthly_rent_agreed),deposit:Number(record.security_deposit_amount),permittedOccupiers:'And your children',sharedFacilities:'Shared driveway at the front of the property',parking:'None',paymentReference:'99 WV109ER - WOODBERRY'},requires_landlord_signature:0,requires_joint_tenant_signature:0,tenant_name:tenantName,tenant_slug:agreementLink('tenant',id),tenant_delivery_email:1,tenant_delivery_sms:0,tenant_delivery_sent_at:at,simulated:true};
  record.tenancy_agreement_sent=1;save();
 }

 // Restore the sent HTML for comparison fixtures created before history was recorded.
 if(data.agreement&&!(data.agreementEmails||[]).length&&!(data.agreementSms||[]).length){await recordAgreementDelivery(data.records[84],{send_email:!!data.agreement.tenant_delivery_email,send_sms:!!data.agreement.tenant_delivery_sms},'sent',data.agreement.issued_at);save();}
 // Update saved simulated invitations for the current agreement to the corrected email presentation.
 if(data.agreement&&data.agreementEmailPresentationVersion!==1){const d=data.agreement.agreement_details;for(const row of data.agreementEmails||[]){if(row.action==='revised'||(row.agreement_id&&row.agreement_id!==data.agreement.id))continue;const message=await agreementEmail(data.records[84],{tenancy_start_date:d.tenancyStartDate,rent:d.rent,deposit:d.deposit});row.body_html=message.body_html;}data.agreementEmailPresentationVersion=1;save();}
})();

