import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {SignJWT,createLocalJWKSet,exportJWK,generateKeyPair} from 'jose';
import jwt from 'jsonwebtoken';

const mocks=vi.hoisted(()=>({query:vi.fn(),queryOne:vi.fn()}));
vi.mock('./db-pg',()=>({query:mocks.query,queryOne:mocks.queryOne}));
import {rentroAuth,useRentroKeySet,verifyRentroToken} from './rentro-auth';

const SUPABASE='https://abcd.supabase.co';
const user='0b6f5c1e-2f6c-4f5e-9a51-3d6c3e2a1b00';
let privateKey:CryptoKey, otherKey:CryptoKey;
const token=(claims:Record<string,unknown>={},opts:{key?:CryptoKey;issuer?:string;audience?:string;exp?:string|number}={})=>
 new SignJWT({role:'authenticated',email:'landlord@example.test',...claims}).setProtectedHeader({alg:'ES256',kid:'test'})
  .setSubject(String(claims.sub??user)).setIssuer(opts.issuer??`${SUPABASE}/auth/v1`).setAudience(opts.audience??'authenticated')
  .setIssuedAt().setExpirationTime(opts.exp??'1h').sign(opts.key??privateKey);
const response=()=>{const res:any={statusCode:200};res.status=vi.fn((c:number)=>{res.statusCode=c;return res;});res.json=vi.fn((d:any)=>{res.data=d;return res;});return res;};

beforeAll(async()=>{
 process.env.SUPABASE_URL=SUPABASE;
 const pair=await generateKeyPair('ES256');privateKey=pair.privateKey;otherKey=(await generateKeyPair('ES256')).privateKey;
 useRentroKeySet(createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'test',alg:'ES256'}]}));
});
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.queryOne.mockResolvedValue({id:user,email:'landlord@example.test',name:'Lee Landlord'});
 mocks.query.mockResolvedValue([{role:'landlord',status:'active',landlord_id:7,tenant_id:null},{role:'tenant',status:'pending_link',landlord_id:null,tenant_id:null}]);
});

describe('Rentro token verification',()=>{
 it('accepts a signed-in Supabase user',async()=>{
  expect(await verifyRentroToken(await token())).toEqual({userId:user,email:'landlord@example.test'});
 });
 it.each([
  ['another project',{},{issuer:'https://other.supabase.co/auth/v1'}],
  ['a different audience',{},{audience:'anon'}],
  ['an expired token',{},{exp:Math.floor(Date.now()/1000)-60}],
  ['an unknown signing key',{},{}],
  ['an anonymous user',{is_anonymous:true},{}],
  ['the anon role',{role:'anon'},{}],
  ['a malformed subject',{sub:'not-a-uuid'},{}],
 ])('rejects %s',async(name,claims,opts)=>{
  const t=name==='an unknown signing key'?await token({}, {key:otherKey}):await token(claims as any,opts as any);
  await expect(verifyRentroToken(t)).rejects.toThrow();
 });
 it('rejects a staff-style token signed with the CRM JWT secret',async()=>{
  const staff=jwt.sign({id:1,email:'admin@fleming.com',role:'admin',sub:user},'staff-secret');
  await expect(verifyRentroToken(staff)).rejects.toThrow();
 });
});

describe('rentroAuth middleware',()=>{
 it('loads the account with only active roles granting access',async()=>{
  const req:any={headers:{authorization:`Bearer ${await token()}`}},res=response(),next=vi.fn();
  await rentroAuth(req,res,next);
  expect(next).toHaveBeenCalled();
  expect(req.rentro).toMatchObject({accountId:user,landlordIds:[7],tenantIds:[]});
  expect(mocks.queryOne.mock.calls[0][0]).toContain("status='active'");
 });
 it('asks for sign-in without a bearer token, and again for a bad one',async()=>{
  for(const authorization of [undefined,'Basic abc','Bearer short',`Bearer ${await token({}, {key:otherKey})}`]){
   const res=response(),next=vi.fn();await rentroAuth({headers:{authorization}} as any,res,next);
   expect(res.statusCode).toBe(401);expect(next).not.toHaveBeenCalled();
  }
 });
 it('refuses a valid token whose CRM account is missing or suspended',async()=>{
  mocks.queryOne.mockResolvedValue(undefined);
  const res=response(),next=vi.fn();await rentroAuth({headers:{authorization:`Bearer ${await token()}`}} as any,res,next);
  expect(res.statusCode).toBe(403);expect(next).not.toHaveBeenCalled();
 });
});
