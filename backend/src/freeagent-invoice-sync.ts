import {freeAgentPages} from './freeagent';
import {matchFreeAgentInvoices} from './freeagent-invoice-matching';
export async function syncFreeAgentInvoiceReferences(client:{query:(sql:string,values?:any[])=>Promise<{rows:any[];rowCount?:number|null}>},accessToken:string,actor?:{id:number;email:string}){
 const invoices=await freeAgentPages<any>('https://api.freeagent.com/v2/invoices?per_page=100','invoices',accessToken);
 const contacts=await freeAgentPages<any>('https://api.freeagent.com/v2/contacts?per_page=100','contacts',accessToken);
 const rents=(await client.query('SELECT r.*,t.name,t.email,p.address,p.postcode FROM rent_payments r JOIN tenants t ON t.id=r.tenant_id JOIN properties p ON p.id=r.property_id')).rows;
 const matches=matchFreeAgentInvoices(rents,invoices,contacts);let updated=0;
 for(const match of matches){
  const changed=await client.query('UPDATE rent_payments SET freeagent_invoice_reference=$2,freeagent_invoice_url=$3 WHERE id=$1 AND freeagent_invoice_url IS NULL RETURNING id',[match.rent_id,match.reference,match.url]);
  if(!changed.rows.length)continue;
  await client.query("UPDATE financial_documents SET snapshot=snapshot||$2::jsonb WHERE rent_payment_id=$1 AND kind='rent_invoice'",[match.rent_id,JSON.stringify({invoice_reference:match.reference,freeagent_invoice_url:match.url})]);
  await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'invoice_reference_imported','rent_payment',$3,$4)",[actor?.id||null,actor?.email||'System',match.rent_id,JSON.stringify({reference:match.reference,source:match.url})]);updated++;
 }
 return {updated,matched:matches.length,sourceInvoices:invoices.length};
}
