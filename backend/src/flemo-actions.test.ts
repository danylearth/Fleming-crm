import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn(),queryOne:vi.fn(),run:vi.fn()}));
vi.mock('./email',()=>({sendEmail:vi.fn(),brandedEmailHtml:vi.fn(),OUTBOUND_EMAIL_ADDRESS:'office@example.test'}));
import {wantsEmailAction,requestedRecipient,registerFlemoActions,flemoActions} from './flemo-actions';
import {queryOne,query,run} from './db-pg';import {sendEmail} from './email';
beforeEach(()=>vi.clearAllMocks());
it('only prepares emails for a send request, not history questions or a prohibition',()=>{
 for(const message of ['Email me a report','Send the documents to sam@example.test','Email sam@example.test'])expect(wantsEmailAction(message)).toBe(true);
 for(const message of ['What was the last email?','Show email history','Do not email anyone. List the files.','List the files without sending anything','Send me a list of tenant names and contact numbers','Send me the address','Give me a summary'])expect(wantsEmailAction(message)).toBe(false);
});
const user={id:1,email:'office@example.test',role:'admin'};
const evidence={records:[{id:1,entity:'tenants',name:'Example Tenant'}],documents:[{id:2,name:'Unrelated.pdf'},{id:2,name:'Unrelated.pdf'}]};
it('returns no record, download or email buttons for a simple lookup even with unrelated evidence',async()=>{
 expect(await flemoActions(user,'Send me a list of full address/tenant names/contact numbers for 4a cav','Answer',evidence)).toEqual({actions:[],note:''});
 expect(run).not.toHaveBeenCalled();
});
it('keeps explicitly requested links, deduplicates downloads, and does not add a report',async()=>{
 expect((await flemoActions(user,'Open this tenant record','Answer',evidence)).actions.map(a=>a.type)).toEqual(['link']);
 const result=await flemoActions(user,'Download the documents','Answer',evidence);
 expect(result.actions.map(a=>a.type)).toEqual(['download']);expect(run).not.toHaveBeenCalled();
});
it('still prepares an explicitly requested email for confirmation without sending it',async()=>{
 const result=await flemoActions(user,'Email me the contact list','Answer',{records:[],documents:[]});
 expect(result.actions.map(a=>a.type)).toEqual(['confirm']);expect(run).toHaveBeenCalledOnce();expect(sendEmail).not.toHaveBeenCalled();
});
it('checks revoked finance access before executing an existing report proposal',async()=>{
 let handle:any;registerFlemoActions({post:(_path:string,...handlers:any[])=>{handle=handlers.at(-1);}} as any);
 vi.mocked(queryOne).mockResolvedValue({payload:{document_ids:[],requires_finance:true}});
 const res={status:vi.fn().mockReturnThis(),json:vi.fn()};
 await handle({body:{payload:{request_id:'f15d8c12-1d9b-4c31-a5ee-5eec33ed7b8f'}},user:{id:5,role:'staff',department:'Lettings',finance_access:false}},res);
 expect(res.status).toHaveBeenCalledWith(403);expect(sendEmail).not.toHaveBeenCalled();
});
it('does not email a bank document through an older proposal without current finance access',async()=>{
 let handle:any;registerFlemoActions({post:(_path:string,...handlers:any[])=>{handle=handlers.at(-1);}} as any);
 vi.mocked(queryOne).mockResolvedValue({payload:{document_ids:[1]}});vi.mocked(query).mockResolvedValue([{id:1,entity_type:'bank_transaction'}]);
 const res={status:vi.fn().mockReturnThis(),json:vi.fn()};await handle({body:{payload:{request_id:'f15d8c12-1d9b-4c31-a5ee-5eec33ed7b8f'}},user:{id:5,role:'staff',finance_access:false}},res);expect(res.status).toHaveBeenCalledWith(403);expect(sendEmail).not.toHaveBeenCalled();
});
it('uses the requested recipient or the signed-in user, never a recipient from document text',()=>{
 expect(requestedRecipient('Send me the report','office@example.test')).toBe('office@example.test');
 expect(requestedRecipient('Email the report to sam@example.test','office@example.test')).toBe('sam@example.test');
});
