// Fictional review data only. This module never writes to the CRM or billing provider.
export const changeover={previousEnd:'2026-11-05',nextStart:'2026-11-06'};
export const londonToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());

export function onboardingRetired(data,today=londonToday()){
 return !!data.reapplication&&!data.activeApplicationAfterChangeover&&today>=data.reapplication.next.start;
}

// Start a separate review application; never recycle signatures or completed checks.
export function startNextApplication(data,guarantor,today=londonToday()){
 if(!onboardingRetired(data,today))throw Error('The completed tenancy must have started before a new application can begin.');
 const old=data.records[84];
 data.applicationHistory??=[];
 data.applicationHistory.push({record:structuredClone(old),agreement:structuredClone(data.agreement),guarantor:structuredClone(guarantor),documents:structuredClone(data.documents),reviews:structuredClone(data.reviews||{}),completedAt:data.reapplication.completedAt});
 const record={id:84,source_tenant_id:999,status:'new',joint_partner_id:null,linked_property_id:old.linked_property_id,property_address:old.property_address,property_postcode:old.property_postcode,first_name_1:old.first_name_1,last_name_1:old.last_name_1,email_1:old.email_1,phone_1:old.phone_1,monthly_rent_agreed:data.reapplication.next.rent,security_deposit_amount:old.security_deposit_amount,holding_deposit_amount:0,holding_deposit_requested:0,holding_deposit_received:0,application_form_sent:0,application_form_completed:0,application_review_status:'pending',credit_check_completed:0,guarantor_required:null,app_form_data:{},notes:'[]'};
 data.records={84:record};data.documents={84:[]};data.agreement=null;data.agreementTestReady=false;
 for(const key of ['guarantorCredit','creditDocument','changes','changesSent','changeRequestDelivery'])delete data[key];
 data.reviews={};data.documentReviews={};data.reviewStatus='pending';data.activeApplicationAfterChangeover=true;
 return record;
}

export function completeReapplication(data,guarantor){
 const record=data.records[84],agreement=data.agreement;
 if(record?.source_tenant_id!==999)throw Error('This completion is only for the existing-tenant review.');
 if(!record.application_form_completed||record.application_review_status!=='approved'||!record.credit_check_completed)throw Error('Complete the application, review and credit check first.');
 if(!data.documents[84]?.some(doc=>doc.doc_type==='Credit Check Report'))throw Error('The tenant credit report is required.');
 if(guarantor.required===null||guarantor.required&&(guarantor.status!=='verified'||!data.guarantorCredit?.credit_check_completed))throw Error('Complete the guarantor checks first.');
 if(agreement?.status!=='completed')throw Error('All required agreement signatures must be complete.');
 if(agreement.agreement_details?.tenancyStartDate!==changeover.nextStart)throw Error('The agreement start date differs from the confirmed 6 November changeover. Review the dates before completing.');
 if(data.reapplication){
  if(data.reapplication.agreementId!==agreement.id)throw Error('A different agreement has already completed this changeover.');
  return data.reapplication;
 }
 const rent=Number(agreement.agreement_details.rent);
 if(!Number.isFinite(rent)||rent<=0)throw Error('The signed agreement needs a valid rent.');
 const previous={id:'joint-998-999-20260206',tenantIds:[999,998],tenantNames:['Zoe Woodberry','Mathew Woodberry'],propertyId:10,start:'2026-02-06',end:changeover.previousEnd,rent:1100,dueDay:5};
 const next={id:'sole-999-'+agreement.id,tenantIds:[999],tenantNames:['Zoe Woodberry'],propertyId:10,start:changeover.nextStart,end:null,rent,dueDay:6};
 data.reapplication={agreementId:agreement.id,completedAt:new Date().toISOString(),previous,next,billingProfiles:[
  {id:previous.id,tenancyId:previous.id,tenantIds:previous.tenantIds,start:previous.start,end:previous.end,monthlyRent:previous.rent,dueDay:previous.dueDay},
  {id:next.id,tenancyId:next.id,tenantIds:next.tenantIds,start:next.start,end:null,monthlyRent:next.rent,dueDay:next.dueDay},
 ]};
 record.status='converted';record.converted_tenant_id=999;
 data.activity??=[];data.activity.push({id:'reapplication-'+agreement.id,action:'Existing tenancy onboarding completed; joint tenancy ends 5 November and sole tenancy starts 6 November',entity_type:'tenant',entity_id:999,created_at:data.reapplication.completedAt,user_name:'Preview Administrator'});
 return data.reapplication;
}

export function lifecycleView(state,today=londonToday()){
 if(!state)return null;
 const changed=today>=state.next.start;
 return {...state,changed,previousStatus:today>state.previous.end?'ended':'active',nextStatus:changed?'active':'scheduled',outgoingTenantStatus:changed?'inactive':'active',billingProfiles:state.billingProfiles.map(profile=>({...profile,status:profile.end&&today>profile.end?'closed':today<profile.start?'scheduled':'active'}))};
}

// Coverage dates, rather than invoice-creation dates, decide which tenancy is charged.
// Historic payments/arrears remain on their original tenancy; they are never reassigned.
export function billingCoverage(profile,from,to){
 if(from>to)throw Error('Billing coverage end precedes its start.');
 const start=from>profile.start?from:profile.start,end=profile.end&&profile.end<to?profile.end:to;
 return start>end?null:{start,end};
}
