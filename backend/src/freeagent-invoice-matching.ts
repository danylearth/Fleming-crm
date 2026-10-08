type Invoice={url:string;contact:string;reference:string;due_on:string;dated_on:string;total_value:string;currency:string;status:string};
type Contact={url:string;email?:string;organisation_name?:string;first_name?:string;last_name?:string;address1?:string;postcode?:string};
type Rent={id:number;tenant_id:number;name:string;email?:string;address:string;postcode:string;due_date:string;amount_due:number;freeagent_invoice_url?:string};
const normal=(s:unknown)=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function matchFreeAgentInvoices(rents:Rent[],invoices:Invoice[],contacts:Contact[]){
 const proposals:{rent_id:number;reference:string;url:string}[]=[];
 for(const rent of rents){
  const matches=invoices.filter(invoice=>{
   if(invoice.currency!=='GBP'||invoice.status==='Cancelled'||!invoice.reference||invoice.due_on!==rent.due_date||Math.round(Number(invoice.total_value)*100)!==Math.round(Number(rent.amount_due)*100))return false;
   const contact=contacts.find(c=>c.url===invoice.contact);if(!contact)return false;
   const sameEmail=!!rent.email&&contact.email?.trim().toLowerCase()===rent.email.trim().toLowerCase();
   const sameName=normal(contact.organisation_name||[contact.first_name,contact.last_name].filter(Boolean).join(' '))===normal(rent.name);
   const sameProperty=normal(contact.postcode)===normal(rent.postcode)&&!!normal(contact.address1)&&normal(rent.address).startsWith(normal(contact.address1));
   return sameProperty&&(sameEmail||sameName);
  });
  if(matches.length===1&&(!rent.freeagent_invoice_url||rent.freeagent_invoice_url===matches[0].url))proposals.push({rent_id:rent.id,reference:matches[0].reference,url:matches[0].url});
 }
 // Never assign the same original invoice to two different rent charges.
 return proposals.filter(p=>proposals.filter(other=>other.url===p.url).length===1);
}
