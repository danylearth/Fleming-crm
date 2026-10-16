import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('./db-pg',()=>({default:{connect:vi.fn()},query:vi.fn(),queryOne:vi.fn(),run:vi.fn()}));
vi.mock('./email',()=>({sendEmail:vi.fn(),brandedEmailHtml:vi.fn()}));
vi.mock('./rentro-supabase',()=>({supabaseConfigured:()=>false,supabaseAdmin:vi.fn(),supabaseIssuer:()=>'https://x/auth/v1'}));
import {registerRentro,rentroAllowedOrigin,rentroSignupMode} from './rentro';

const routes={use:new Map<string,any>(),get:new Map<string,any>()};
const app={use:(p:string,h:any)=>routes.use.set(p,h),get:(p:string,...h:any[])=>routes.get.set(p,h.at(-1)),post:vi.fn(),put:vi.fn()};
registerRentro(app as any);
const response=()=>{const res:any={statusCode:200};res.status=vi.fn((c:number)=>{res.statusCode=c;return res;});res.json=vi.fn((d:any)=>{res.data=d;return res;});return res;};
afterEach(()=>{delete process.env.RENTRO_ENABLED;delete process.env.RENTRO_SIGNUP;delete process.env.RENTRO_ALLOWED_ORIGINS;});

describe('Rentro switch',()=>{
 it('hides every Rentro route unless RENTRO_ENABLED is exactly true',()=>{
  for(const value of [undefined,'1','TRUE','yes']){
   if(value===undefined)delete process.env.RENTRO_ENABLED;else process.env.RENTRO_ENABLED=value;
   const res=response(),next=vi.fn();routes.use.get('/api/rentro')({},res,next);
   expect(next).not.toHaveBeenCalled();expect(res.statusCode).toBe(404);
  }
  process.env.RENTRO_ENABLED='true';
  const next=vi.fn();routes.use.get('/api/rentro')({},response(),next);
  expect(next).toHaveBeenCalled();
 });
 it('reports the sign-up mode, defaulting to the pilot allowlist',()=>{
  const res=response();routes.get.get('/api/rentro/status')({},res);
  expect(res.data).toEqual({enabled:true,signup:'allowlist'});
  process.env.RENTRO_SIGNUP='open';expect(rentroSignupMode()).toBe('open');
  process.env.RENTRO_SIGNUP='anything else';expect(rentroSignupMode()).toBe('allowlist');
 });
 it('accepts only exact HTTPS origins from RENTRO_ALLOWED_ORIGINS',()=>{
  process.env.RENTRO_ALLOWED_ORIGINS='https://rentro-staging.vercel.app, https://rentro.example';
  expect(rentroAllowedOrigin('https://rentro-staging.vercel.app')).toBe(true);
  expect(rentroAllowedOrigin('https://rentro-staging.vercel.app.evil.test')).toBe(false);
  expect(rentroAllowedOrigin('https://other.vercel.app')).toBe(false);
  process.env.RENTRO_ALLOWED_ORIGINS='http://rentro.example';
  expect(rentroAllowedOrigin('http://rentro.example')).toBe(false);
 });
});
