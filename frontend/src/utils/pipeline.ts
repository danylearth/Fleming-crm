interface PipelineEnquiry {status:string;viewing_date?:string;viewing_time?:string;handover_date?:string;handover_not_required?:number;balance_payment_requested?:number;balance_payment_received?:number;balance_follow_up_date?:string;follow_up_date?:string;tenancy_agreement_status?:string;application_form_completed?:number|boolean;application_review_status?:string}
export function pipelineVisible(e:PipelineEnquiry,today:string,time='00:00'){
 if(['converted','rejected','not_interested','closed','archived'].includes(e.status))return false;
 if(e.balance_payment_received&&!e.handover_not_required&&e.handover_date)return e.handover_date.slice(0,10)<=today;
 if(e.status==='viewing_booked'&&e.viewing_date){const day=e.viewing_date.slice(0,10);return day<today||(day===today&&(!e.viewing_time||e.viewing_time.slice(0,5)<=time));}
 if(e.balance_payment_requested&&!e.balance_payment_received)return !!e.balance_follow_up_date&&e.balance_follow_up_date.slice(0,10)<=today;
 return !e.tenancy_agreement_status||e.tenancy_agreement_status==='completed'||!!(e.follow_up_date&&e.follow_up_date.slice(0,10)<=today);
}
export function pipelineStage(e:PipelineEnquiry,today:string){
 if(e.balance_payment_received)return e.handover_not_required?'Ready to Convert':e.handover_date?'Handover Due':'Book Handover';
 if(e.balance_payment_requested)return 'Final Balance Follow-up';
 if(e.tenancy_agreement_status==='completed')return 'Agreement Signed';
 if(e.application_form_completed)return e.application_review_status==='approved'?'Application Approved':'Application Completed';
 if(e.status==='viewing_booked')return 'Viewing Booked';
 if(e.follow_up_date&&e.follow_up_date.slice(0,10)<=today)return 'Follow-up Due';
 return e.status.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
}
