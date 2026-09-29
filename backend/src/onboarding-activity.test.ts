import {beforeEach,expect,it,vi} from 'vitest';
const {queryOne,query}=vi.hoisted(()=>({queryOne:vi.fn(),query:vi.fn()}));
vi.mock('./db-pg',()=>({queryOne,query}));
vi.mock('./auth',()=>({authMiddleware:vi.fn()}));
import {onboardingActivity,registerOnboardingActivity} from './onboarding-activity';
const handlers=new Map<string,any>();
registerOnboardingActivity({get:(path:string,...args:any[])=>handlers.set(path,args.at(-1)),post:(path:string,...args:any[])=>handlers.set(path,args.at(-1))} as any);
beforeEach(()=>{queryOne.mockReset();query.mockReset();});
it('keeps last view time separate from last agent progression',async()=>{
 queryOne.mockResolvedValueOnce({created_at:'2026-09-26T14:00:00Z'}).mockResolvedValueOnce({created_at:'2026-09-26T13:00:00Z',agent:'Agent A'});
 expect(await onboardingActivity(999)).toEqual({last_viewed_at:'2026-09-26T14:00:00Z',last_progressed_at:'2026-09-26T13:00:00Z',last_progressed_by:'Agent A'});
 const progressSql=queryOne.mock.calls[1][0];
 expect(progressSql).toContain("a.user_id IS NOT NULL");expect(progressSql).not.toContain("'view'");
 expect(query).not.toHaveBeenCalled();
});
it('records an authenticated onboarding view against only the tenant enquiry',async()=>{
 queryOne.mockResolvedValueOnce({id:999}).mockResolvedValue(null);
 const json=vi.fn();
 await handlers.get('/api/tenant-enquiries/:id/onboarding-view')({params:{id:'999'},user:{id:7,email:'agent@example.test'}},{json});
 expect(query.mock.calls[0][0]).toContain("'view','tenant_enquiry'");
 expect(query.mock.calls[0][1]).toEqual([7,'agent@example.test',999,JSON.stringify({section:'tenant_onboarding'})]);
 expect(json).toHaveBeenCalledWith({last_viewed_at:null,last_progressed_at:null,last_progressed_by:null});
});
