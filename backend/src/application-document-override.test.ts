import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({connect:vi.fn(),query:vi.fn(),release:vi.fn()}));
vi.mock('./db-pg',()=>({default:{connect:db.connect},query:vi.fn(),queryOne:vi.fn()}));
vi.mock('./email',()=>({applicationChangesRequestedEmail:vi.fn()}));
import {registerApplicationReview} from './application-review';
let handler:any;
let enquiry:any;
let uploaded=false,issued=false;
beforeEach(()=>{
 enquiry={id:84,status:'onboarding',application_form_completed:1,application_review_status:'pending',app_form_data:{employment_status:'Employed'},application_document_overrides:{}};
 uploaded=false;issued=false;vi.clearAllMocks();
 db.connect.mockResolvedValue({query:db.query,release:db.release});
 db.query.mockImplementation(async(sql:string)=>{
  if(sql.startsWith('SELECT * FROM tenant_enquiries'))return {rows:[enquiry]};
  if(sql.includes('FROM tenancy_agreements'))return {rowCount:issued?1:0,rows:[]};
  if(sql.includes('FROM documents'))return {rowCount:uploaded?1:0,rows:[]};
  return {rows:[],rowCount:1};
 });
 registerApplicationReview({put:(path:string,...handlers:any[])=>{if(path.endsWith('/document-override'))handler=handlers.at(-1);},post:vi.fn()} as any);
});
async function submit(overridden=true){
 const res:any={code:200,status(code:number){this.code=code;return this;},json(body:any){this.body=body;return this;}};
 await handler({params:{id:'84'},body:{doc_type:'Proof of Income or Employment',overridden},user:{id:1,email:'staff@example.test'}},res);
 return res;
}
it('persists and audits an override for only this applicant inside one transaction',async()=>{
 const res=await submit();expect(res.code).toBe(200);
 const update=db.query.mock.calls.find(([sql])=>sql.startsWith('UPDATE tenant_enquiries'))!;
 expect(JSON.parse(update[1][0])['Proof of Income or Employment']).toMatchObject({status:'overridden',reviewed_by:1});
 expect(update[1][1]).toBe(84);
 expect(db.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO audit_log'))).toBe(true);
 expect(db.query).toHaveBeenCalledWith('COMMIT');expect(db.release).toHaveBeenCalled();
});
it('refuses to bypass review of a document that exists',async()=>{
 uploaded=true;expect((await submit()).code).toBe(409);
 expect(db.query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 expect(db.query).toHaveBeenCalledWith('ROLLBACK');
});
it('blocks changes while awaiting resubmission or after an agreement was issued',async()=>{
 enquiry.application_review_status='changes_requested';enquiry.application_changes_sent_at='2026-09-29';
 expect((await submit()).code).toBe(409);
 enquiry.application_review_status='pending';issued=true;
 expect((await submit()).code).toBe(409);
 expect(db.query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('resets only the selected override and retains other exemptions',async()=>{
 enquiry.application_document_overrides={'Proof of Income or Employment':{status:'overridden'},'Bank Statements':{status:'overridden'}};
 expect((await submit(false)).code).toBe(200);
 const update=db.query.mock.calls.find(([sql])=>sql.startsWith('UPDATE tenant_enquiries'))!;
 expect(JSON.parse(update[1][0])).toEqual({'Bank Statements':{status:'overridden'}});
});
