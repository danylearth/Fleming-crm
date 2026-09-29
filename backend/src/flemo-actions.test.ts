import {expect,it,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn(),queryOne:vi.fn(),run:vi.fn()}));
vi.mock('./email',()=>({sendEmail:vi.fn(),brandedEmailHtml:vi.fn(),OUTBOUND_EMAIL_ADDRESS:'office@example.test'}));
import {wantsEmailAction,requestedRecipient,registerFlemoActions} from './flemo-actions';
import {queryOne,query} from './db-pg';import {sendEmail} from './email';
it('only prepares emails for a send request, not history questions or a prohibition',()=>{
 for(const message of ['Email me a report','Send the documents to sam@example.test','Email sam@example.test'])expect(wantsEmailAction(message)).toBe(true);
 for(const message of ['What was the last email?','Show email history','Do not email anyone. List the files.','List the files without sending anything'])expect(wantsEmailAction(message)).toBe(false);
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
