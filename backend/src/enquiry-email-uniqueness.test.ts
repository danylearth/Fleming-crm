import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({query:vi.fn(),release:vi.fn(),connect:vi.fn()}));
vi.mock('./db-pg',()=>({default:{connect:mock.connect}}));
import {withUniqueEnquiryEmails,DuplicateEnquiryEmail,emailExistsSql} from './enquiry-email-uniqueness';
beforeEach(()=>{vi.clearAllMocks();mock.query.mockResolvedValue({rows:[]});mock.connect.mockResolvedValue(mock);});
it('normalises and locks both emails in a stable order before insertion',async()=>{
 const work=vi.fn().mockResolvedValue(12);await expect(withUniqueEnquiryEmails([' Z@Example.com ','a@example.com'],work)).resolves.toBe(12);
 expect(mock.query.mock.calls.filter(([sql])=>sql.includes('advisory')).map(([,args])=>args[0])).toEqual(['public-enquiry-email:a@example.com','public-enquiry-email:z@example.com']);
 expect(mock.query).toHaveBeenCalledWith('COMMIT');expect(mock.release).toHaveBeenCalled();
});
it('blocks duplicates before creating either joint record',async()=>{
 mock.query.mockImplementation(async(sql:string)=>({rows:sql===emailExistsSql?[{exists:1}]:[]}));const work=vi.fn();
 await expect(withUniqueEnquiryEmails(['EXISTING@example.com'],work)).rejects.toBeInstanceOf(DuplicateEnquiryEmail);expect(work).not.toHaveBeenCalled();expect(mock.query).toHaveBeenCalledWith('ROLLBACK');expect(mock.release).toHaveBeenCalled();
});
it('rejects the same email for both applicants',async()=>{await expect(withUniqueEnquiryEmails(['a@example.com',' A@example.com '],vi.fn())).rejects.toBeInstanceOf(DuplicateEnquiryEmail);expect(mock.connect).not.toHaveBeenCalled();});
