import {it,expect} from 'vitest';
import {matchFreeAgentInvoices} from './freeagent-invoice-matching';
const rent={id:1,tenant_id:2,name:'Example Tenant',email:'example@example.test',address:'24 Example Road, Exampleton',postcode:'EX1 1AA',due_date:'2026-09-30',amount_due:875};
const contact={url:'contact/1',email:rent.email,address1:'24 Example Road',postcode:'EX1 1AA'};
const invoice={url:'invoice/1',contact:contact.url,reference:'1246',due_on:'2026-09-30',dated_on:'2026-09-30',total_value:'875.00',currency:'GBP',status:'Sent'};
it('copies the original reference only when contact, property, date and amount agree',()=>expect(matchFreeAgentInvoices([rent],[invoice],[contact])).toEqual([{rent_id:1,reference:'1246',url:'invoice/1'}]));
it('rejects same-amount coincidences, cancelled invoices and wrong rental periods',()=>{
 for(const patch of [{due_on:'2026-08-30'},{total_value:'850'},{status:'Cancelled'},{currency:'EUR'}])expect(matchFreeAgentInvoices([rent],[{...invoice,...patch}],[contact])).toEqual([]);
 expect(matchFreeAgentInvoices([rent],[invoice],[{...contact,email:'different@example.test'}])).toEqual([]);
 expect(matchFreeAgentInvoices([rent],[invoice],[{...contact,address1:'26 Example Road'}])).toEqual([]);
});
it('preserves references already allocated in FreeAgent without changing payment or invoice status',()=>expect(matchFreeAgentInvoices([rent],[{...invoice,status:'Draft'}],[contact])[0]?.reference).toBe('1246'));
it('does not guess between duplicate invoices or duplicate charges',()=>{
 expect(matchFreeAgentInvoices([rent],[invoice,{...invoice,url:'invoice/2'}],[contact])).toEqual([]);
 expect(matchFreeAgentInvoices([rent,{...rent,id:2}],[invoice],[contact])).toEqual([]);
});
