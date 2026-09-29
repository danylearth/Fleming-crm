import pool from './db-pg';
import {issueFinancialDocument,rentInvoiceSource,rentInvoiceSnapshot} from './financial-documents';
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

export function nextRentDueDate(today:string,paymentDay:number){
 const date=new Date(today.slice(0,10)+'T12:00:00Z');
 for(let offset=0;offset<2;offset++){const due=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+offset,1,12));due.setUTCDate(Math.min(paymentDay,new Date(Date.UTC(due.getUTCFullYear(),due.getUTCMonth()+1,0)).getUTCDate()));const value=due.toISOString().slice(0,10);if(value>=today.slice(0,10))return value;}
 throw Error('Could not determine next rent due date');
}
let retryAfter=0;

// An end date on a billing boundary closes the preceding rental period; it
// must not start a further full month's charge. Agreed mid-period endings
// retain the monthly charge for an office-led final-account adjustment.
export function scheduledRentCharges(start:string,through:string,paymentDay?:number,endDate?:string|null){
  const dates=rentDueDates(start,through,paymentDay).filter(d=>d>=start.slice(0,10)&&(!endDate||d<endDate.slice(0,10)));
  return dates.map(due=>{
    const nextMonth=new Date(due+'T12:00:00Z');nextMonth.setUTCMonth(nextMonth.getUTCMonth()+2,0);
    const next=rentDueDates(start,nextMonth.toISOString().slice(0,10),paymentDay).find(d=>d>due);
    return {due,final:Boolean(endDate&&next&&next>=endDate.slice(0,10))};
  });
}

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
    }
      // Charges are enabled only after the office's opening balance has been recorded.
      const setting=(await client.query('SELECT cutover_date::text FROM rent_tracking_settings WHERE id=1')).rows[0];
      if(setting?.cutover_date) {
        await client.query('BEGIN');
        const tenants=(await client.query(`SELECT t.* FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.tenancy_start_date IS NOT NULL AND t.monthly_rent>0 AND p.archived_at IS NULL AND (t.status='active' OR (t.status='inactive' AND t.tenancy_end_date IS NOT NULL))
          AND NOT EXISTS(SELECT 1 FROM tenants partner WHERE partner.id=t.linked_tenant_id AND partner.id<t.id AND partner.property_id=t.property_id AND partner.tenancy_start_date=t.tenancy_start_date)`)).rows;
        for(const tenant of tenants) {
          const monthEnd=nextRentDueDate(today,tenant.rent_due_day||Number(String(tenant.tenancy_start_date).slice(8,10)));
          for(const {due,final} of scheduledRentCharges(String(tenant.tenancy_start_date),monthEnd,tenant.rent_due_day,tenant.tenancy_end_date).filter(c=>c.due>setting.cutover_date)) {
            const inserted=await client.query(`INSERT INTO rent_payments(property_id,tenant_id,due_date,amount_due,amount_paid,status,notes)
              SELECT $1,$2,$3,$4,0,'pending',$5 WHERE NOT EXISTS(SELECT 1 FROM rent_payments WHERE tenant_id=$2 AND due_date=$3) RETURNING id`,[tenant.property_id,tenant.id,due,tenant.monthly_rent,final?'Final scheduled monthly rent charge':'Scheduled monthly rent charge']);
            if(inserted.rowCount)await client.query("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES('system@scheduler','create','rent_payment',$1,$2)",[inserted.rows[0].id,JSON.stringify({due_date:due,amount_due:tenant.monthly_rent})]);
            if(!inserted.rowCount)await client.query(`WITH changed AS (UPDATE rent_payments SET notes=$3 WHERE tenant_id=$1 AND due_date=$2
              AND notes IN ('Scheduled monthly rent charge','Final scheduled monthly rent charge') AND notes IS DISTINCT FROM $3 RETURNING id)
              INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) SELECT 'system@scheduler','update','rent_payment',id,$4 FROM changed`,
              [tenant.id,due,final?'Final scheduled monthly rent charge':'Scheduled monthly rent charge',JSON.stringify({final_invoice:final})]);
          }
        }
        await client.query('COMMIT');
      }
      // Save each current or upcoming invoice once, including already-paid charges.
      const invoices=(await client.query(`SELECT r.id FROM rent_payments r JOIN tenants t ON t.id=r.tenant_id JOIN properties p ON p.id=r.property_id
        WHERE r.due_date >= $1::date AND r.due_date < ($1::date + INTERVAL '2 months') AND r.amount_due>0
        AND (t.status='active' OR (t.status='inactive' AND t.tenancy_end_date IS NOT NULL)) AND p.archived_at IS NULL
        AND (t.tenancy_end_date IS NULL OR r.due_date < t.tenancy_end_date::date)
        AND NOT EXISTS(SELECT 1 FROM financial_documents d WHERE d.source_key='rent:'||r.id::text)`,[today.slice(0,7)+'-01'])).rows;
      for(const invoice of invoices){const source=await rentInvoiceSource(invoice.id);if(source)await issueFinancialDocument('rent_invoice','rent:'+source.id,rentInvoiceSnapshot(source),{tenant_id:source.tenant_id,landlord_id:source.landlord_id,property_id:source.property_id,rent_payment_id:source.id},{id:null,email:'system@scheduler'});}
      await client.query('INSERT INTO finance_daily_runs(business_date) VALUES($1) ON CONFLICT DO NOTHING',[today]);
    // Rent reminders are sent only by an office user from the tenant record.
  } catch(error){retryAfter=now.getTime()+15*60*1000;await client.query('ROLLBACK');throw error;}
  finally{if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('finance-daily'))");client.release();}
}
