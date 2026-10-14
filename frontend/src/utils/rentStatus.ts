export function rentStatus(payment:{amount_due:number|string;amount_paid?:number|string|null;due_date:string},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date())){
 if(Number(payment.amount_due)===0&&Number(payment.amount_paid||0)===0)return 'not due';
 if(Number(payment.amount_paid||0)>=Number(payment.amount_due))return 'paid';
 const due=payment.due_date.slice(0,10);return due<today?'overdue':due===today?'due today':'pending';
}
