import {dateOnly} from './tenant-lifecycle';

export function changeoverDates(start:unknown,previousStart:unknown){
 const next=dateOnly(start),previous=dateOnly(previousStart);
 const date=new Date(next+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(next)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==next)throw Error('The signed agreement must contain a valid tenancy start date');
 if(previous&&next<=previous)throw Error('The new tenancy must start after the existing tenancy');
 date.setUTCDate(date.getUTCDate()-1);
 return {start:next,previousEnd:date.toISOString().slice(0,10)};
}

export function changeoverState(start:unknown,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date())){
 return dateOnly(start)<=today?'active':'scheduled';
}

export function validateChangeoverApplicants(applicants:any[],agreement:any,existing:any[]){
 if(!applicants.length||applicants.some(e=>!e.source_tenant_id))throw Error('Every continuing applicant must be linked to their existing tenant record');
 const ids=applicants.map(e=>Number(e.source_tenant_id));
 if(new Set(ids).size!==ids.length)throw Error('An existing tenant cannot appear twice in the same application');
 if(!agreement||agreement.status!=='completed'||!agreement.signed_filename)throw Error('Complete and store every required tenancy agreement signature first');
 if(applicants.some(e=>!e.application_form_completed||e.application_review_status!=='approved'||!e.credit_check_completed))throw Error('Complete every applicant’s application, review and credit check');
 if(applicants.some(e=>Number(e.linked_property_id)!==Number(agreement.property_id)))throw Error('All applicants must be linked to the property on the signed agreement');
 if(ids.some(id=>!existing.some(t=>Number(t.id)===id)))throw Error('A continuing tenant record is missing');
 const occupied=existing.filter(t=>t.status==='active');
 if(occupied.some(t=>Number(t.property_id)!==Number(agreement.property_id)))throw Error('End the continuing tenant’s other property tenancy before this changeover');
 if(occupied.length>2||occupied.length===2&&!(Number(occupied[0].linked_tenant_id)===Number(occupied[1].id)&&Number(occupied[1].linked_tenant_id)===Number(occupied[0].id)))throw Error('Review the existing property occupants before scheduling this changeover');
 return ids;
}
