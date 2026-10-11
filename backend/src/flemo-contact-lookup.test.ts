import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn()}));
import {query} from './db-pg';
import {contactLookup,contactLookupMessage} from './flemo-contact-lookup';
import {flemoEvidence} from './flemo-records';
const request='send me a list of fukll address/tenant names /contact numbers for: 4a cav/25 wealden hatch/21 caval/29 wealden hatch - all fleming lettings own portfolio clients';
beforeEach(()=>vi.clearAllMocks());
it('recognises the reported lookup without misclassifying mixed document or financial requests',()=>{
 expect(contactLookup(request)).toBe(true);expect(contactLookup('Full address for 4a cav')).toBe(true);
 for(const text of ['Contact details and rent arrears','Phone numbers and bank balances','Tenant names and passport documents'])expect(contactLookup(text)).toBe(false);
});
it('keeps a short address confirmation connected to the contact lookup',()=>{
 expect(contactLookupMessage('Yes, 2A Cavalier Circus',[{role:'user',text:request},{role:'assistant',text:'Did you mean 2A Cavalier Circus?'}])).toContain(request);
 expect(contactLookupMessage('What rent is due?',[{role:'user',text:request}])).toBe('What rent is due?');
});
it('retrieves only scoped current contact candidates, without documents, finance, SMS, or record IDs',async()=>{
 const contacts=[{name:'Test Tenant',phone:'01234',email:null,property_address:'4A Cavalier Circus',property_postcode:'WV10 8TR'}];
 vi.mocked(query).mockResolvedValue(contacts);
 const result=await flemoEvidence(request,'all',undefined,false,false);
 expect(query).toHaveBeenCalledOnce();
 const [sql,params]=vi.mocked(query).mock.calls[0];
 expect(params).toEqual(['all',true]);expect(sql).toContain("t.status='active'");expect(sql).toContain("l.landlord_type='internal'");expect(sql).toContain("($1='all' OR l.landlord_type=$1)");
 expect(result.contacts).toEqual(contacts);expect(result.records).toEqual([]);expect(result.documents).toEqual([]);expect(result.paymentHistory).toEqual([]);
});
it('retains the selected portfolio scope for contact requests',async()=>{
 vi.mocked(query).mockResolvedValue([]);await flemoEvidence('List tenant names and phone numbers','external');
 expect(vi.mocked(query).mock.calls[0][1]).toEqual(['external',false]);
});
