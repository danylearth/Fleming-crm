export function rentDueTiming(dueDate:string,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date())){
 const due=dueDate.slice(0,10);
 return due<today?{label:'Overdue',className:'text-red-700 dark:text-red-400 bg-red-500/10'}:due===today?{label:'Due today',className:'text-amber-700 dark:text-amber-400 bg-amber-500/10'}:{label:'In advance',className:'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'};
}
