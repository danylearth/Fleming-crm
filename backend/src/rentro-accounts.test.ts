import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({queryOne:vi.fn(),sql:vi.fn(),release:vi.fn(),generateLink:vi.fn(),deleteUser:vi.fn(),sendEmail:vi.fn()}));
vi.mock('./db-pg',()=>({default:{connect:async()=>({query:mocks.sql,release:mocks.release})},query:vi.fn(),queryOne:mocks.queryOne,run:vi.fn()}));
vi.mock('./email',()=>({sendEmail:mocks.sendEmail,brandedEmailHtml:(t:string,c:string)=>`<h1>${t}</h1>${c}`}));
vi.mock('./rentro-supabase',()=>({supabaseAdmin:()=>({auth:{admin:{generateLink:mocks.generateLink,deleteUser:mocks.deleteUser}}})}));
import {createRentroLandlord,signupInput,weakPassword} from './rentro-accounts';
import {InputError} from './rentro-scope';

const userId='0b6f5c1e-2f6c-4f5e-9a51-3d6c3e2a1b00';
const body={email:' Lee@Example.test ',password:'correct horse battery',name:' Lee  Landlord ',terms:true};

beforeEach(()=>{
 vi.clearAllMocks();delete process.env.RENTRO_SIGNUP;
 mocks.queryOne.mockImplementation(async(sql:string)=>sql.includes('rentro_pilot_allowlist')?{ok:1}:undefined);
 mocks.generateLink.mockResolvedValue({data:{user:{id:userId},properties:{action_link:'https://abcd.supabase.co/auth/v1/verify?token=t'}},error:null});
 mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('INSERT INTO landlords')?[{id:88}]:[]}));
 mocks.sendEmail.mockResolvedValue({success:true});
});

describe('Rentro sign-up input',()=>{
 it('normalises email and name and requires the pilot terms',()=>{
  expect(signupInput(body)).toEqual({email:'lee@example.test',password:'correct horse battery',name:'Lee Landlord',phone:null});
  expect(()=>signupInput({...body,terms:false})).toThrow(InputError);
 });
 it('rejects short, common and email-based passwords',()=>{
  expect(weakPassword('short','a@b.c')).toMatch(/12 characters/);
  expect(weakPassword('mypassword123!','a@b.c')).toMatch(/easy to guess/);
  expect(weakPassword('leelandlord-2026','leelandlord@example.test')).toMatch(/email/);
  expect(weakPassword('correct horse battery','lee@example.test')).toBeNull();
 });
});

describe('creating a Rentro landlord',()=>{
 it('creates the Supabase user, a Rentro landlord and an active role, then sends the confirmation email',async()=>{
  expect(await createRentroLandlord(signupInput(body))).toEqual({userId,pendingLink:false,emailSent:true});
  expect(mocks.generateLink).toHaveBeenCalledWith(expect.objectContaining({type:'signup',email:'lee@example.test'}));
  const sqls=mocks.sql.mock.calls.map(c=>c[0]);
  expect(sqls).toContain('COMMIT');
  expect(sqls.find((s:string)=>s.startsWith('INSERT INTO landlords'))).toContain("'rentro'");
  expect(sqls.find((s:string)=>s.startsWith('INSERT INTO customer_roles'))).toContain("'active'");
  expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({to:'lee@example.test',html:expect.stringContaining('verify?token=t')});
 });
 it('waits for staff when the email already belongs to a CRM landlord',async()=>{
  mocks.sql.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT id FROM landlords')?[{id:5}]:[]}));
  expect((await createRentroLandlord(signupInput(body))).pendingLink).toBe(true);
  const sqls=mocks.sql.mock.calls.map(c=>c[0]);
  expect(sqls.some((s:string)=>s.startsWith('INSERT INTO landlords'))).toBe(false);
  expect(sqls.find((s:string)=>s.startsWith('INSERT INTO customer_roles'))).toContain("'pending_link'");
  expect(sqls.find((s:string)=>s.startsWith('INSERT INTO tasks'))).toContain("'rentro_authority'");
 });
 it('keeps the pilot invite-only unless sign-up is open',async()=>{
  mocks.queryOne.mockResolvedValue(undefined);
  await expect(createRentroLandlord(signupInput(body))).rejects.toThrow(/invite-only/);
  expect(mocks.generateLink).not.toHaveBeenCalled();
  process.env.RENTRO_SIGNUP='open';
  await expect(createRentroLandlord(signupInput(body))).resolves.toMatchObject({userId});
 });
 it('refuses an email that already has an account',async()=>{
  mocks.queryOne.mockImplementation(async(sql:string)=>sql.includes('customer_accounts')?{ok:1}:{ok:1});
  await expect(createRentroLandlord(signupInput(body))).rejects.toThrow(/already exists/);
 });
 it('removes the Supabase user again if the CRM records cannot be saved',async()=>{
  mocks.sql.mockImplementation(async(sql:string)=>{if(sql.startsWith('INSERT INTO customer_accounts'))throw new Error('db down');return {rows:[]};});
  await expect(createRentroLandlord(signupInput(body))).rejects.toThrow('db down');
  expect(mocks.sql.mock.calls.map(c=>c[0])).toContain('ROLLBACK');
  expect(mocks.deleteUser).toHaveBeenCalledWith(userId);
  expect(mocks.sendEmail).not.toHaveBeenCalled();
 });
});
