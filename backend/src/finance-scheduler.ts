import pool from './db-pg';
import {syncFreeAgent} from './freeagent';
import {rentReminderEmail,sendEmail,OUTBOUND_EMAIL_ADDRESS} from './email';
import {sendSms,SMS_FROM} from './sms';

export function rentDueDates(start:string,through:string):string[] {
  const origin=new Date(start.slice(0,10)+'T12:00:00Z');
  if(!Number.isFinite(origin.getTime()))return [];
  const dates:string[]=[];
  for(let offset=0;offset<1200;offset++) {
    const month=new Date(Date.UTC(origin.getUTCFullYear(),origin.getUTCMonth()+offset,1,12));
    const last=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
    month.setUTCDate(Math.min(origin.getUTCDate(),last));
    const day=month.toISOString().slice(0,10);
    if(day>through)break;
    dates.push(day);
  }
  return dates;
}

let retryAfter=0;

// Run on the minute; PostgreSQL locks and dated records survive restarts and multiple instances.
export async function runFinanceSchedule(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const today=`${parts.year}-${parts.month}-${parts.day}`;
  if(Number(parts.hour)<2||now.getTime()<retryAfter)return;
  const client=await pool.connect();let locked=false;
  try {
    locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('finance-daily')) AS locked")).rows[0].locked;
    if(!locked)return;
    const done=(await client.query('SELECT 1 FROM finance_daily_runs WHERE business_date=$1',[today])).rowCount;
    if(!done) {
      const connected=(await client.query("SELECT id FROM bank_feed_connections WHERE provider='freeagent' AND status='connected' LIMIT 1")).rowCount;
      if(connected)await syncFreeAgent();
      // Charges are enabled only after the office's opening balance has been recorded.
      const setting=(await client.query('SELECT cutover_date::text FROM rent_tracking_settings WHERE id=1')).rows[0];
      if(setting?.cutover_date) {
        await client.query('BEGIN');
        const tenants=(await client.query(`SELECT t.* FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.tenancy_start_date IS NOT NULL AND t.monthly_rent>0 AND p.archived_at IS NULL AND (t.status='active' OR t.tenancy_end_date IS NOT NULL)
          AND NOT EXISTS(SELECT 1 FROM tenants partner WHERE partner.id=t.linked_tenant_id AND partner.id<t.id AND partner.property_id=t.property_id AND partner.tenancy_start_date=t.tenancy_start_date)`)).rows;
        for(const tenant of tenants) {
          const end=tenant.tenancy_end_date&&String(tenant.tenancy_end_date).slice(0,10)<today?String(tenant.tenancy_end_date).slice(0,10):today;
          for(const due of rentDueDates(String(tenant.tenancy_start_date),end).filter(d=>d>setting.cutover_date)) {
            const inserted=await client.query(`INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status,notes)
              SELECT $1,$2,$3,$4,0,'pending','Scheduled monthly rent charge' WHERE NOT EXISTS(SELECT 1 FROM rent_payments WHERE tenant_id=$2 AND due_date=$3) RETURNING id`,[tenant.property_id,tenant.id,due,tenant.monthly_rent]);
            if(inserted.rowCount)await client.query("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES('system@scheduler','create','rent_payment',$1,$2)",[inserted.rows[0].id,JSON.stringify({due_date:due,amount_due:tenant.monthly_rent})]);
          }
        }
        await client.query('COMMIT');
      }
      await client.query('INSERT INTO finance_daily_runs(business_date) VALUES($1) ON CONFLICT DO NOTHING',[today]);
    }
    if(Number(parts.hour)<9||Number(parts.hour)>=18)return;
    const setting=(await client.query('SELECT cutover_date::text,chasers_enabled FROM rent_tracking_settings WHERE id=1')).rows[0];
    if(!setting?.chasers_enabled)return;
    const freshFeed=(await client.query("SELECT 1 FROM bank_feed_connections WHERE provider='freeagent' AND status='connected' AND last_synced_at>=$1::date LIMIT 1",[today])).rowCount;
    if(!freshFeed)return;
    // Office review must catch up before reminders: an unmatched credit may be rent.
    const unreviewed=(await client.query("SELECT 1 FROM bank_feed_transactions WHERE amount>0 AND match_status='unmatched' AND booked_at>=CURRENT_DATE-30 LIMIT 1")).rowCount;
    if(unreviewed)return;
    const overdue=(await client.query(`SELECT r.*,t.name,t.email,t.phone,p.address FROM rent_payments r JOIN tenants t ON t.id=r.tenant_id JOIN properties p ON p.id=r.property_id
      WHERE r.due_date>$1::date AND r.due_date<$2::date AND COALESCE(r.amount_paid,0)<r.amount_due AND t.status='active' AND p.archived_at IS NULL`,[setting.cutover_date,today])).rows;
    for(const rent of overdue) {
      // Recheck under the same row lock reconciliation uses, before claiming a reminder.
      await client.query('BEGIN');
      const current=(await client.query('SELECT amount_due,amount_paid FROM rent_payments WHERE id=$1 FOR UPDATE',[rent.id])).rows[0];
      if(Number(current.amount_paid||0)>=Number(current.amount_due)){await client.query('ROLLBACK');continue;}
      const name=String(rent.name).split(' ')[0];const date=String(rent.due_date).slice(0,10);
      const formatted=new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
      const message=`Hi ${name}, our records show that your rent payment for ${formatted} has not yet been received and is now overdue. Please arrange payment of the outstanding balance as soon as possible. If payment has already been made, please let us know so we can update our records.`;
      for(const channel of ['email','sms']) {
        if(!(channel==='email'?rent.email:rent.phone))continue;
        const recent=(await client.query("SELECT 1 FROM rent_chaser_deliveries WHERE rent_payment_id=$1 AND channel=$2 AND cycle_date>$3::date-7",[rent.id,channel,today])).rowCount;
        if(recent)continue;
        // Commit the delivery claim before sending; an uncertain send must never auto-retry.
        await client.query('INSERT INTO rent_chaser_deliveries(rent_payment_id,channel,cycle_date) VALUES($1,$2,$3)',[rent.id,channel,today]);
        await client.query('COMMIT');
        const email=rentReminderEmail(name,Number(current.amount_due)-Number(current.amount_paid||0),rent.address,date);
        let result:{success:boolean;simulated?:boolean;id?:string;sid?:string;error?:string};
        try {result=channel==='email'?await sendEmail({to:rent.email,...email}):await sendSms({to:rent.phone,body:message});}
        catch {result={success:false,error:'Delivery could not be confirmed; check before retrying'};}
        const status=result.simulated?'simulated':result.success?'sent':'failed';
        await client.query('UPDATE rent_chaser_deliveries SET status=$1,error=$2,provider_id=$3 WHERE rent_payment_id=$4 AND channel=$5 AND cycle_date=$6',[status,result.error||null,result.id||result.sid||null,rent.id,channel,today]);
        if(channel==='email')await client.query("INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,sent_by_email,error_message) VALUES($1,'tenant',$2,$3,$4,$5,'rent_overdue',$6,$7,'system@scheduler',$8)",[result.id||null,rent.tenant_id,rent.email,OUTBOUND_EMAIL_ADDRESS,email.subject,email.html,status,result.error||null]);
        else await client.query("INSERT INTO sms_messages(entity_type,entity_id,to_phone,from_phone,message_body,status,twilio_sid,error_message,sent_by_email) VALUES('tenant',$1,$2,$3,$4,$5,$6,$7,'system@scheduler')",[rent.tenant_id,rent.phone,SMS_FROM||null,message,status,result.sid||null,result.error||null]);
        await client.query("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES('system@scheduler','rent_chaser','rent_payment',$1,$2)",[rent.id,JSON.stringify({channel,status})]);
        await client.query('BEGIN');
        const latest=(await client.query('SELECT amount_due,amount_paid FROM rent_payments WHERE id=$1 FOR UPDATE',[rent.id])).rows[0];
        if(Number(latest.amount_paid||0)>=Number(latest.amount_due))break;
      }
      await client.query('COMMIT');
    }
  } catch(error){retryAfter=now.getTime()+15*60*1000;await client.query('ROLLBACK');throw error;}
  finally{if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('finance-daily'))");client.release();}
}
