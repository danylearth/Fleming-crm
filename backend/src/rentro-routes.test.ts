import {describe,expect,it,vi} from 'vitest';

vi.mock('./db-pg',()=>({default:{connect:vi.fn()},query:vi.fn(),queryOne:vi.fn(),run:vi.fn()}));
vi.mock('./email',()=>({sendEmail:vi.fn(),brandedEmailHtml:(t:string,c:string)=>t+c}));
vi.mock('./rentro-supabase',()=>({supabaseConfigured:()=>false,supabaseAdmin:vi.fn(),supabaseIssuer:()=>'https://x/auth/v1'}));
import {registerRentro,RENTRO_PUBLIC_ROUTES} from './rentro';
import {rentroAuth} from './rentro-auth';

// Every Rentro route bypasses the staff guard, so each one must authenticate the customer itself.
describe('Rentro route protection',()=>{
 const routes:{route:string;handlers:any[]}[]=[];
 const capture=(method:string)=>(path:string,...handlers:any[])=>routes.push({route:`${method} ${path}`,handlers});
 registerRentro({use:vi.fn(),get:capture('GET'),post:capture('POST'),put:capture('PUT'),patch:capture('PATCH'),delete:capture('DELETE')} as any);

 it('registers the M1 routes',()=>{
  for(const route of ['GET /api/rentro/me','GET /api/rentro/portfolio','POST /api/rentro/properties','POST /api/rentro/properties/import','POST /api/rentro/properties/:id/authority'])
   expect(routes.map(r=>r.route)).toContain(route);
 });
 it('puts rentroAuth first on every route that is not explicitly public',()=>{
  const guarded=routes.filter(r=>!RENTRO_PUBLIC_ROUTES.includes(r.route));
  expect(guarded.length).toBeGreaterThan(5);
  for(const r of guarded)expect(r.handlers[0],r.route).toBe(rentroAuth);
 });
 it('keeps the public list to status, the bot check and sign-up',()=>{
  expect(RENTRO_PUBLIC_ROUTES).toEqual(['GET /api/rentro/status','GET /api/rentro/signup-challenge','POST /api/rentro/signup']);
  for(const route of RENTRO_PUBLIC_ROUTES)expect(routes.map(r=>r.route)).toContain(route);
 });
});
