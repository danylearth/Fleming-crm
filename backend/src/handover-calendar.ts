type Client={query:(sql:string,values?:any[])=>Promise<{rows:any[]}>};
export async function syncHandoverCalendar(client:Client,ids:number[],booking:{withLandlord:boolean;name:string;time:string;location:string;assignedTo:string;enquiryId:number;date:string}){
 if(booking.withLandlord){
  await client.query("UPDATE tasks SET status='archived',updated_at=NOW() WHERE entity_type='tenant_enquiry' AND entity_id=ANY($1::int[]) AND task_type='handover' AND status IN ('pending','in_progress')",[ids]);
  return;
 }
 const existing=(await client.query("SELECT id FROM tasks WHERE entity_type='tenant_enquiry' AND entity_id=ANY($1::int[]) AND task_type='handover' ORDER BY id LIMIT 1",[ids])).rows[0];
 const values=[`Tenancy handover: ${booking.name}`.trim(),`${booking.time} at ${booking.location}`,booking.assignedTo,booking.enquiryId,booking.date];
 if(existing)await client.query("UPDATE tasks SET title=$1,description=$2,assigned_to=$3,entity_id=$4,due_date=$5,status='pending',updated_at=NOW() WHERE id=$6",[...values,existing.id]);
 else await client.query("INSERT INTO tasks(title,description,status,priority,assigned_to,entity_type,entity_id,due_date,task_type) VALUES($1,$2,'pending','high',$3,'tenant_enquiry',$4,$5,'handover')",values);
}
