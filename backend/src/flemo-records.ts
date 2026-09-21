import {query} from './db-pg';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const exec=promisify(execFile);
const stop=new Set('what where when which who how is are was were the a an in on at for to of and with tell me show find about tenant tenants property properties street road drive avenue flat house please documents document information rent payment payments'.split(' '));
export async function flemoEvidence(message:string,portfolio:string,context?:{entityType?:string;entityId?:number},readScans=false,includeFinance=true) {
  const tenants=await query(`SELECT t.id,t.name,t.email,t.phone,t.status,t.date_of_birth_1 AS date_of_birth,t.current_address,t.previous_address,t.nok_name,t.nok_phone,t.guarantor_name,t.guarantor_address,t.guarantor_email,t.additional_guarantors,t.income_amount,t.income_frequency,t.income_employer,t.notes,t.monthly_rent,t.tenancy_start_date,t.tenancy_end_date,t.property_id,p.address AS property_address,p.postcode AS property_postcode,'tenants' AS entity FROM tenants t LEFT JOIN properties p ON p.id=t.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE ($1='all' OR l.landlord_type=$1) AND p.archived_at IS NULL ORDER BY t.name LIMIT 500`,[portfolio]);
  const properties=await query(`SELECT p.id,p.address AS name,p.postcode,p.property_type,p.bedrooms,p.status,p.rent_amount,p.epc_expiry_date,p.eicr_expiry_date,p.gas_safety_expiry_date,'properties' AS entity FROM properties p LEFT JOIN landlords l ON l.id=p.landlord_id WHERE ($1='all' OR l.landlord_type=$1) AND p.archived_at IS NULL ORDER BY p.address LIMIT 500`,[portfolio]);
  const enquiries=await query(`SELECT te.id,concat_ws(' ',te.first_name_1,te.last_name_1) AS name,te.email_1 AS email,te.status,te.linked_property_id AS property_id,te.application_form_completed,te.application_review_status,te.credit_check_completed,'enquiries' AS entity FROM tenant_enquiries te LEFT JOIN properties p ON p.id=te.linked_property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE ($1='all' OR l.landlord_type=$1) AND te.status NOT IN ('rejected','converted') ORDER BY te.id DESC LIMIT 200`,[portfolio]);
  const landlords=await query(`SELECT id,name,email,phone,entity_type,company_number,landlord_type,'landlords' AS entity FROM landlords WHERE ($1='all' OR landlord_type=$1) ORDER BY name LIMIT 200`,[portfolio]);
  const catalog=[...tenants,...properties,...enquiries,...landlords];
  const words=message.toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>2&&!stop.has(word));
  const entityMap:Record<string,string>={tenant:'tenants',property:'properties',tenant_enquiry:'enquiries',landlord:'landlords',tenants:'tenants',properties:'properties',enquiries:'enquiries',landlords:'landlords'};
  const exact=catalog.filter(record=>message.toLowerCase().includes(String(record.name).toLowerCase()));
  let records=exact.length?exact:catalog.filter(record=>(record.id===Number(context?.entityId)&&record.entity===entityMap[context?.entityType||'']) || words.some(word=>String(record.name).toLowerCase().split(/[^a-z0-9]+/).includes(word)));
  if(!records.length && /\b(list|all|names)\b/i.test(message))records=/\bpropert/i.test(message)?properties:tenants;
  records=records.slice(0,30);
  const entities=records.map(record=>({entity_type:record.entity==='enquiries'?'tenant_enquiry':record.entity==='tenants'?'tenant':record.entity==='landlords'?'landlord':'property',entity_id:record.id}));
  for(const record of records)if(record.property_id)entities.push({entity_type:'property',entity_id:record.property_id});
  const documents=entities.length?await query(`SELECT d.id,d.doc_type,d.original_name,d.filename,d.mime_type,d.size,d.review_status,d.entity_type,d.entity_id FROM documents d WHERE EXISTS(SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS e(entity_type text,entity_id int) WHERE d.entity_type=e.entity_type AND d.entity_id=e.entity_id) ORDER BY d.uploaded_at DESC LIMIT 20`,[JSON.stringify(entities)]):[];
  const requestedTypes=/electrical|eicr/i.test(message)?/electrical|eicr/i:/inventory/i.test(message)?/inventory/i:/deposit|tds/i.test(message)?/deposit|tds/i:null;
  if(requestedTypes)documents.sort((a,b)=>Number(requestedTypes.test(b.doc_type))-Number(requestedTypes.test(a.doc_type)));
  const fileRoot=path.resolve(process.env.UPLOADS_PATH||path.join(__dirname,'../uploads'));
  const documentEvidence=[];
  let scannedDocuments=0;
  for(const [index,document] of documents.entries()){let extracted='';let limitation='Only document metadata is available';
    const resolved=path.resolve(fileRoot,document.filename||'');
    const filename=resolved.startsWith(fileRoot+path.sep)?resolved:'';
    if(index<5 && document.mime_type==='application/pdf' && Number(document.size||0)<=20*1024*1024 && fs.existsSync(filename)){
      try{const result=await exec(process.env.PDFTOTEXT_PATH||'pdftotext',['-f','1','-l','12','-layout',filename,'-'],{timeout:5000,maxBuffer:256*1024});extracted=result.stdout.slice(0,10000);limitation=extracted.trim().length<30?'Scanned PDF: text could not be read. Office review is needed.':'Text from up to 12 pages; maximum 10,000 characters';}catch{limitation='PDF text could not be extracted. Office review is needed.';}
    }
    if(readScans && extracted.trim().length<30 && scannedDocuments<2 && Number(document.size||0)<=20*1024*1024 && fs.existsSync(filename) && ['application/pdf','image/jpeg','image/png'].includes(document.mime_type)){
      scannedDocuments++;const temp=fs.mkdtempSync(path.join(os.tmpdir(),'flemo-read-'));
      try{
        let images=[filename];
        if(document.mime_type==='application/pdf'){await exec('pdftoppm',['-f','1','-l','3','-scale-to','1800','-png',filename,path.join(temp,'page')],{timeout:10000,maxBuffer:65536});images=fs.readdirSync(temp).filter(name=>name.endsWith('.png')).sort().map(name=>path.join(temp,name));}
        const texts=[];for(const image of images){const result=await exec('tesseract',[image,'stdout','-l','eng'],{timeout:6000,maxBuffer:128*1024});texts.push(result.stdout);}
        extracted=texts.join('\n').slice(0,10000);limitation='OCR from up to 3 pages. Scan recognition can be wrong; check the source before relying on an exact value.';
      }catch{limitation='The scan could not be read. Office review is needed.';}finally{fs.rmSync(temp,{recursive:true,force:true});}
    }
    documentEvidence.push({id:document.id,type:document.doc_type,name:document.original_name,review_status:document.review_status,text:extracted,limitation});
  }
  const paymentHistory=await query(`SELECT t.id AS tenant_id,t.name,p.address,COUNT(*)::int AS recorded_charges,COUNT(*) FILTER(WHERE r.payment_date>r.due_date AND COALESCE(r.amount_paid,0)>=r.amount_due)::int AS paid_late,ROUND(AVG(r.payment_date-r.due_date) FILTER(WHERE r.payment_date>r.due_date AND COALESCE(r.amount_paid,0)>=r.amount_due),1) AS average_days_late,COUNT(*) FILTER(WHERE r.due_date<(NOW() AT TIME ZONE 'Europe/London')::date AND COALESCE(r.amount_paid,0)<r.amount_due)::int AS overdue_charges,COALESCE(SUM(r.amount_paid),0) AS recorded_paid,COALESCE(SUM(GREATEST(0,r.amount_due-COALESCE(r.amount_paid,0))) FILTER(WHERE r.due_date<(NOW() AT TIME ZONE 'Europe/London')::date),0) AS overdue_amount FROM rent_payments r JOIN tenants t ON t.id=r.tenant_id JOIN properties p ON p.id=r.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE ($1='all' OR l.landlord_type=$1) AND p.archived_at IS NULL GROUP BY t.id,p.address ORDER BY overdue_amount DESC LIMIT 100`,[portfolio]);
  const scheduled=await query(`SELECT COUNT(*)::int AS active_tenancies,COALESCE(SUM(rent),0) AS scheduled_monthly_rent FROM (SELECT p.id,MAX(COALESCE(t.monthly_rent,p.rent_amount,0)) AS rent FROM tenants t JOIN properties p ON p.id=t.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE t.status='active' AND p.archived_at IS NULL AND ($1='all' OR l.landlord_type=$1) GROUP BY p.id) x`,[portfolio]);
  const monthly=await query(`SELECT COALESCE(SUM(r.amount_paid),0) AS recorded_paid,COALESCE(SUM(GREATEST(0,r.amount_due-COALESCE(r.amount_paid,0))),0) AS outstanding FROM rent_payments r JOIN properties p ON p.id=r.property_id LEFT JOIN landlords l ON l.id=p.landlord_id WHERE ($1='all' OR l.landlord_type=$1) AND p.archived_at IS NULL AND r.due_date>=date_trunc('month',NOW() AT TIME ZONE 'Europe/London')::date AND r.due_date<(date_trunc('month',NOW() AT TIME ZONE 'Europe/London')+INTERVAL '1 month')::date`,[portfolio]);
  const latestSms=[];
  for(const record of records.filter(r=>r.entity==='tenants').slice(0,10)){
    const rows=await query(`SELECT s.message_body,s.status,s.created_at FROM sms_messages s JOIN tenants t ON t.id=$1 WHERE s.direction='outbound' AND ((s.entity_type='tenant' AND s.entity_id=t.id) OR s.enquiry_id=t.source_enquiry_id OR (COALESCE(t.phone,'')<>'' AND RIGHT(REGEXP_REPLACE(COALESCE(s.to_phone,''),'[^0-9]','','g'),10)=RIGHT(REGEXP_REPLACE(t.phone,'[^0-9]','','g'),10))) ORDER BY s.created_at DESC,s.id DESC LIMIT 1`,[record.id]);
    latestSms.push({tenant_id:record.id,name:record.name,message:rows[0]||null});
  }
  const summary=records.length?`Matching CRM records:\n${records.map(record=>`${record.name} — ${record.status || record.entity}`).join('\n')}${documentEvidence.length?`\n${documentEvidence.length} associated documents found.`:''}`:'No matching record found. Include the tenant’s full name or property address.';
  return {records,summary,documents:documentEvidence,paymentHistory:includeFinance?paymentHistory:[],latestSms,portfolioSummary:{...(includeFinance?scheduled[0]:{}),chargesDueThisCalendarMonth:includeFinance?monthly[0]:undefined,currency:'GBP',jointTenantsCountOnce:true},catalog:catalog.map(record=>({id:record.id,name:record.name,entity:record.entity,status:record.status})),limitations:['Amounts come from recorded CRM charges and payments, not a bank balance.','No recorded payments means payment timeliness cannot be assessed.','Document uploads are evidence held, not verified identity or eligibility.']};
}
