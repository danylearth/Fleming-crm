import pool from './db-pg';
import {syncFreeAgent} from './freeagent';

export function rentDueDates(start:string,through:string,paymentDay?:number):string[] {
  const origin=new Date(start.slice(0,10)+'T12:00:00Z');
  if(!Number.isFinite(origin.getTime()))return [];
  const dates:string[]=[];
  for(let offset=0;offset<1200;offset++) {
    const month=new Date(Date.UTC(origin.getUTCFullYear(),origin.getUTCMonth()+offset,1,12));
    const last=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
    month.setUTCDate(Math.min(paymentDay || origin.getUTCDate(),last));
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
          for(const due of rentDueDates(String(tenant.tenancy_start_date),end,tenant.rent_due_day).filter(d=>d>setting.cutover_date)) {
            const inserted=await client.query(`INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status,notes)
              SELECT $1,$2,$3,$4,0,'pending','Scheduled monthly rent charge' WHERE NOT EXISTS(SELECT 1 FROM rent_payments WHERE tenant_id=$2 AND due_date=$3) RETURNING id`,[tenant.property_id,tenant.id,due,tenant.monthly_rent]);
            if(inserted.rowCount)await client.query("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES('system@scheduler','create','rent_payment',$1,$2)",[inserted.rows[0].id,JSON.stringify({due_date:due,amount_due:tenant.monthly_rent})]);
          }
        }
        await client.query('COMMIT');
      }
      await client.query('INSERT INTO finance_daily_runs(business_date) VALUES($1) ON CONFLICT DO NOTHING',[today]);
    }
    // Rent reminders are sent only by an office user from the tenant record.
  } catch(error){retryAfter=now.getTime()+15*60*1000;await client.query('ROLLBACK');throw error;}
  finally{if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('finance-daily'))");client.release();}
}
