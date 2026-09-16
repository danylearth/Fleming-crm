import {flemoActions,registerFlemoActions} from './flemo-actions';
import {flemoAccount,flemoAccountStatus,registerFlemoOAuthRoutes} from './flemo-oauth';
import {flemoEvidence} from './flemo-records';
import type { Express } from 'express';
import { authMiddleware, AuthRequest } from './auth';
import { query } from './db-pg';
import { syncTenantLifecycle } from './tenant-lifecycle-db';

export function flemoIntent(message: string) {
  const text = message.toLowerCase();
  if (/\b(sms|text message|texted)\b/.test(text)) return 'sms';
  if (/\b(id|identification|passport|kyc)\b/.test(text)) return 'id';
  if (/rent.*review|review.*rent/.test(text)) return 'reviews';
  if (/end|expir|renew|lease/.test(text)) return 'ending';
  if (/rent|incom|portfolio|collect/.test(text)) return 'rent';
  return 'help';
}
const money = (n: unknown) => Number(n || 0).toLocaleString('en-GB',{style:'currency',currency:'GBP'});
export function registerFlemoRoutes(app: Express) {
  registerFlemoOAuthRoutes(app);
  registerFlemoActions(app);
  app.post('/api/ai/chat', authMiddleware, async (req: AuthRequest,res) => {
    const { message, context, history } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.length > 2000) return res.status(400).json({ error: 'Ask a question up to 2,000 characters' });
    const portfolio = ['internal','external'].includes(context?.portfolio) ? context.portfolio : 'all';
    const scope = "($1='all' OR l.landlord_type=$1)";
    try {
      await syncTenantLifecycle();
      let text = ''; let records: any[] = [];
      const intent = flemoIntent(message);
      const previous = Array.isArray(history) ? history.slice(-8).filter(item=>item && ['user','assistant'].includes(item.role)&&typeof item.text==='string').map(item=>({role:item.role,text:item.text.slice(0,3000)})) : [];
      const accountStatus=await flemoAccountStatus(req.user.id).catch(()=>({connected:false}));
      if(accountStatus.connected){
        const evidence=await flemoEvidence([...previous.filter(item=>item.role==='user').slice(-2).map(item=>item.text),message].join(' '),portfolio,context,true);
        const text=await(await flemoAccount(req.user.id)).answer(message,JSON.stringify({...evidence,conversation:previous}));
        const result=await flemoActions(req.user,message,text,evidence);
        return res.json({text:text+(result.note?'\n\n'+result.note:''),actions:result.actions,as_of:new Date().toISOString()});
      }
      if (/late|overdue|arrears|payment.*trend/i.test(message)) {
        const evidence=await flemoEvidence(message,portfolio,context);
        const namedIds=new Set(evidence.records.filter(r=>r.entity==='tenants').map(r=>r.id));
        const history=namedIds.size?evidence.paymentHistory.filter(r=>namedIds.has(r.tenant_id)):evidence.paymentHistory;
        text=history.length?history.map(r=>`${r.name}: ${r.paid_late} recorded late payments${r.average_days_late ? ` (average ${r.average_days_late} days late)` : ''}; ${r.overdue_charges} overdue charges (${money(r.overdue_amount)}).`).join('\n')+'\nBased on recorded charges and payments, not a live bank balance.': 'No recorded payment history is available for this selection. Payment timing and late-payment trends cannot be established yet.';
        records=evidence.records;
      } else
if (intent === 'rent') {
        const rows = await query(`SELECT p.id,p.address,MAX(COALESCE(t.monthly_rent,p.rent_amount,0)) AS rent FROM tenants t JOIN properties p ON p.id=t.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE t.status='active' AND ${scope} GROUP BY p.id ORDER BY p.address`,[portfolio]);
        const payments = await query(`SELECT COALESCE(SUM(r.amount_paid),0) AS paid,COALESCE(SUM(GREATEST(0,r.amount_due-COALESCE(r.amount_paid,0))),0) AS outstanding FROM rent_payments r JOIN properties p ON p.id=r.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE ${scope} AND r.due_date >= date_trunc('month',NOW() AT TIME ZONE 'Europe/London')::date AND r.due_date < (date_trunc('month',NOW() AT TIME ZONE 'Europe/London')+INTERVAL '1 month')::date`,[portfolio]);
        text = `Scheduled monthly rent is ${money(rows.reduce((sum,r) => sum+Number(r.rent),0))} across ${rows.length} active tenancies. Joint tenants count once per property.\nFor charges due this calendar month: ${money(payments[0].paid)} recorded as paid; ${money(payments[0].outstanding)} outstanding. These figures use CRM records, not a live bank balance.`;
        records = rows.map(r => ({ ...r, entity:'properties' }));
      } else if (intent === 'id') {
        records = await query(`SELECT t.id,t.name,'tenants' AS entity FROM tenants t LEFT JOIN properties p ON p.id=t.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE t.status='active' AND ${scope} AND ((COALESCE(t.kyc_primary_id,0)=0 AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.entity_type='tenant' AND d.entity_id::text=t.id::text AND d.doc_type='Primary Identification' AND COALESCE(d.review_status,'pending')<>'rejected')) OR (COALESCE(t.kyc_secondary_id,0)=0 AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.entity_type='tenant' AND d.entity_id::text=t.id::text AND d.doc_type='Secondary Identification' AND COALESCE(d.review_status,'pending')<>'rejected'))) ORDER BY t.name`,[portfolio]);
        text = records.length ? `${records.length} active tenants have primary or secondary ID missing from both their checklist and document records:\n${records.map(r => r.name).join('\n')}\nUploaded documents awaiting review count as held, not verified. Completion overrides do not establish that ID is held.` : 'All active tenants in this portfolio have both primary and secondary ID recorded or uploaded; pending files still need review.';
      } else if (intent === 'ending') {
        records = await query(`SELECT t.id,t.name,t.tenancy_end_date::text AS end_date,'tenants' AS entity FROM tenants t JOIN properties p ON p.id=t.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE ${scope} AND t.status IN ('active','scheduled') AND t.has_end_date=1 AND t.tenancy_end_date BETWEEN (NOW() AT TIME ZONE 'Europe/London')::date AND (NOW() AT TIME ZONE 'Europe/London')::date+60 ORDER BY t.tenancy_end_date,t.name`,[portfolio]);
        text = records.length ? `Tenancies scheduled to end in the next 60 days:\n${records.map(r => `${r.name} — ${r.end_date}`).join('\n')}` : 'No tenancies have a scheduled end date in the next 60 days in this portfolio.';
      } else if (intent === 'reviews') {
        records = await query(`SELECT p.id,p.address AS name,COALESCE(p.rent_review_date,(MAX(t.rent_last_reviewed)+INTERVAL '1 year')::date)::text AS due_date,'properties' AS entity FROM properties p JOIN tenants t ON t.property_id=p.id AND t.status='active' LEFT JOIN landlords l ON l.id=p.landlord_id WHERE ${scope} GROUP BY p.id HAVING COALESCE(p.rent_review_date,(MAX(t.rent_last_reviewed)+INTERVAL '1 year')::date) >= date_trunc('month',NOW() AT TIME ZONE 'Europe/London')::date AND COALESCE(p.rent_review_date,(MAX(t.rent_last_reviewed)+INTERVAL '1 year')::date) < (date_trunc('month',NOW() AT TIME ZONE 'Europe/London')+INTERVAL '1 month')::date ORDER BY due_date`,[portfolio]);
        text = records.length ? `Rent reviews due this calendar month:\n${records.map(r => `${r.name} — ${r.due_date}`).join('\n')}\nThese are review reminders; a rent increase still requires its own notice workflow.` : 'No rent reviews are dated for this calendar month in this portfolio.';
      } else if (intent === 'sms') {
        const tenants = await query(`SELECT t.id,t.name,t.phone,t.source_enquiry_id FROM tenants t LEFT JOIN properties p ON p.id=t.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE ${scope} ORDER BY t.name`,[portfolio]);
        const nameText = (value: string) => value.toLowerCase().replace(/\bmatthew\b/g, 'mathew');
        const named = tenants.filter(t => nameText(message).includes(nameText(t.name)));
        const selected = named.length ? named : context?.entityType === 'tenant' ? tenants.filter(t => t.id === Number(context.entityId)) : tenants.filter(t => String(t.name).toLowerCase().split(/\s+/).some((part: string) => part.length>2 && message.toLowerCase().split(/\W+/).includes(part)));
        if (selected.length !== 1) text = selected.length ? `Which tenant do you mean? Please use their full name:\n${selected.map(t => t.name).join('\n')}` : 'Please include the tenant’s full name, or open their record and ask “What was the last SMS sent to this tenant?”';
        else {
          const tenant=selected[0];
          const rows=await query(`SELECT message_body,status,created_at FROM sms_messages WHERE direction='outbound' AND ((entity_type='tenant' AND entity_id=$1) OR enquiry_id=$2 OR ($3<>'' AND RIGHT(REGEXP_REPLACE(COALESCE(to_phone,''),'[^0-9]','','g'),10)=RIGHT(REGEXP_REPLACE($3,'[^0-9]','','g'),10))) ORDER BY created_at DESC,id DESC LIMIT 1`,[tenant.id,tenant.source_enquiry_id,tenant.phone || '']);
          text=rows.length ? `Latest outgoing SMS recorded for ${tenant.name}, ${new Date(rows[0].created_at).toLocaleString('en-GB',{timeZone:'Europe/London'})} (${rows[0].status}):\n${rows[0].message_body}` : `No outgoing SMS is recorded for ${tenant.name}.`;
          records=[{...tenant,entity:'tenants'}];
        }
      } else {
        const evidence=await flemoEvidence(message,portfolio,context);
        records=evidence.records;
        text=evidence.summary+'\nConnect ChatGPT in Settings for open-ended chat and document analysis.';
        const result=await flemoActions(req.user,message,text,evidence);
        return res.json({text:text+(result.note?'\n\n'+result.note:''),actions:result.actions,as_of:new Date().toISOString()});
      }
      res.json({text,actions:records.slice(0,10).map(r => ({id:`${r.entity}-${r.id}`,type:'link',label:r.name || r.address,href:`/${r.entity}/${r.id}`})),as_of:new Date().toISOString()});
    } catch(error) { console.error('Flemo lookup failed:',error); res.status(500).json({ error:'Could not read the CRM records. Please try again.' }); }
  });
}
