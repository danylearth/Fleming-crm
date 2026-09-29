import {beforeEach,expect,it,vi} from 'vitest';
const queryOne=vi.hoisted(()=>vi.fn());
vi.mock('./db-pg',()=>({queryOne}));
vi.mock('./auth',()=>({authMiddleware:vi.fn()}));
import {registerEnquiryPropertyGate} from './enquiry-property-gate';
const handlers=new Map<string,any>();
const register=(path:string,...args:any[])=>handlers.set(path,args.at(-1));
registerEnquiryPropertyGate({use:register,post:register} as any);
beforeEach(()=>{queryOne.mockReset();queryOne.mockImplementation(async(sql:string,args:any[])=>sql.includes('FROM properties')?(args[0]===7?{id:7}:null):{linked_property_id:null,status:'new'});});
async function call(route:string,body:any={},path='/',method='POST') { const next=vi.fn(),res:any={code:200};res.status=(code:number)=>{res.code=code;return res;};res.json=vi.fn();await handlers.get(route)({method,params:{id:'1'},body,path},res,next);return {res,next}; }
it.each(['/request-holding-deposit','/send-application-email','/holding-deposit/email-preview','/credit-check'])('blocks %s without a linked property',async path=>{const {res,next}=await call('/api/tenant-enquiries/:id',{},path);expect(res.code).toBe(400);expect(next).not.toHaveBeenCalled();});
it.each(['onboarding','viewing_booked','awaiting_response'])('requires a real property for %s',async status=>{expect((await call('/api/tenant-enquiries/:id',{status,linked_property_id:999})).res.code).toBe(400);expect((await call('/api/tenant-enquiries/:id',{status,linked_property_id:7})).next).toHaveBeenCalled();});
it('does not treat an action payload as a persisted link',async()=>{expect((await call('/api/tenant-enquiries/:id',{linked_property_id:7},'/request-holding-deposit')).res.code).toBe(400);});
it('permits linking a valid property and ordinary notes on an unlinked new enquiry',async()=>{expect((await call('/api/tenant-enquiries/:id',{linked_property_id:7})).next).toHaveBeenCalled();expect((await call('/api/tenant-enquiries/:id',{notes:'note'})).next).toHaveBeenCalled();});
it('allows rejection without a property',async()=>{expect((await call('/api/tenant-enquiries/:id',{template:'rejection'},'/send-workflow-email')).next).toHaveBeenCalled();});
it('blocks bulk progression before any records are changed',async()=>{expect((await call('/api/tenant-enquiries/bulk-update',{ids:[1,2],status:'onboarding'})).res.code).toBe(400);});
it('requires a property even for an office viewing',async()=>{expect((await call('/api/property-viewings',{enquiry_id:1,viewing_location:'Office'})).res.code).toBe(400);expect((await call('/api/property-viewings',{enquiry_id:1,property_id:7})).next).toHaveBeenCalled();});
it('blocks a follow-up task for an unlinked enquiry',async()=>{expect((await call('/api/tasks',{entity_type:'tenant_enquiry',entity_id:1,task_type:'follow_up'})).res.code).toBe(400);});
