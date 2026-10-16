import {describe,expect,it,vi} from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('./db-pg',()=>({default:{connect:vi.fn()},query:vi.fn(),queryOne:vi.fn()}));
vi.mock('./rentro-supabase',()=>({supabaseConfigured:()=>false,supabaseAdmin:vi.fn(),supabaseIssuer:()=>'https://x/auth/v1'}));
import {addSelfManagedProperty,previewImport,propertyInput,ukPostcode} from './rentro-portfolio';
import {ownershipStatus} from './rentro-status';
import {InputError} from './rentro-scope';

const ctx={accountId:'0b6f5c1e-2f6c-4f5e-9a51-3d6c3e2a1b00',email:'lee@example.test',name:'Lee Landlord',roles:[],landlordIds:[7],tenantIds:[]};
const home={address:'12 Mare Street',postcode:'e81aa',city:'London',property_type:'flat',bedrooms:'2',occupancy:'occupied',claimed_role:'owner'};

/** A transaction client that records SQL and answers the duplicate lookup with `existing`. */
function fakeClient(existing:any[]=[]){
 const calls:{sql:string;params:any[]}[]=[];
 return {calls,query:vi.fn(async(sql:string,params:any[]=[])=>{
  calls.push({sql,params});
  if(sql.startsWith('SELECT id,address,address_line_2,city,postcode,archived_at FROM properties'))return {rows:existing};
  if(sql.startsWith('INSERT INTO properties'))return {rows:[{id:501}]};
  if(sql.startsWith('INSERT INTO rentro_property_claims'))return {rows:[{id:9}]};
  return {rows:[]};
 })};
}

describe('Rentro property input',()=>{
 it('normalises a UK postcode and accepts the CRM property types',()=>{
  expect(ukPostcode('e81aa')).toBe('E8 1AA');expect(ukPostcode('SW1A 1aa')).toBe('SW1A 1AA');expect(ukPostcode('12345')).toBeNull();
  expect(propertyInput(home)).toMatchObject({postcode:'E8 1AA',property_type:'flat',bedrooms:2,occupancy:'occupied',claimed_role:'owner'});
 });
 it.each([
  [{postcode:'nope'},'postcode'],[{address:''},'address'],[{property_type:'castle'},'property type'],
  [{bedrooms:'2.5'},'Bedrooms'],[{occupancy:'sold'},'occupied'],[{claimed_role:'tenant'},'role'],
 ])('rejects %o with a message the landlord can act on',(change,hint)=>{
  expect(()=>propertyInput({...home,...change})).toThrow(InputError);
  expect(()=>propertyInput({...home,...change})).toThrow(new RegExp(hint,'i'));
 });
});

describe('adding a home to a Rentro portfolio',()=>{
 it('creates a self-managed property that is never marked for letting',async()=>{
  const client=fakeClient();
  expect(await addSelfManagedProperty(client as any,ctx,propertyInput(home))).toEqual({status:'created',property_id:501});
  const insert=client.calls.find(c=>c.sql.startsWith('INSERT INTO properties'))!;
  expect(insert.sql).toContain("'self_managed'");
  expect(insert.params.at(-1)).toBe('let');
  const vacant=fakeClient();await addSelfManagedProperty(vacant as any,ctx,propertyInput({...home,occupancy:'vacant'}));
  expect(vacant.calls.find(c=>c.sql.startsWith('INSERT INTO properties'))!.params.at(-1)).toBeNull();
  expect(client.calls.some(c=>c.sql.startsWith('INSERT INTO property_landlords'))).toBe(true);
  expect(client.calls.some(c=>c.sql.startsWith('INSERT INTO rentro_property_claims'))).toBe(true);
  expect(client.calls.find(c=>c.sql.startsWith('INSERT INTO audit_log'))!.params.at(-1)).toBe(ctx.accountId);
 });
 it('never attaches an address that already exists; staff review the claim instead',async()=>{
  const client=fakeClient([{id:33,address:'12 Mare Street',postcode:'E8 1AA',city:'London',address_line_2:null}]);
  expect(await addSelfManagedProperty(client as any,ctx,propertyInput(home))).toEqual({status:'duplicate_review',claim_id:9});
  expect(client.calls.some(c=>c.sql.startsWith('INSERT INTO properties'))).toBe(false);
  expect(client.calls.some(c=>c.sql.startsWith('INSERT INTO property_landlords'))).toBe(false);
  const task=client.calls.find(c=>c.sql.startsWith('INSERT INTO tasks'))!;
  expect(task.sql).toContain("'rentro_authority'");expect(task.params[2]).toBe(33);
 });
 it('refuses accounts without an active landlord role',async()=>{
  await expect(addSelfManagedProperty(fakeClient() as any,{...ctx,landlordIds:[],roles:[{role:'landlord',status:'pending_link',landlord_id:null,tenant_id:null}]},propertyInput(home))).rejects.toThrow(/connecting your account/);
 });
 it('previews an import row by row, flagging repeats and existing addresses',async()=>{
  const client=fakeClient();
  const {results}=await previewImport(client as any,[home,{...home,postcode:'bad'},home]);
  expect(results.map(r=>r.ok)).toEqual([true,false,false]);
  expect(results[2].error).toMatch(/more than once/);
 });
});

describe('ownership status labels',()=>{
 it('maps each stage to a plain label, owner and next step',()=>{
  expect(ownershipStatus(null,'self_managed')).toMatchObject({label:'To do',owner:'you'});
  expect(ownershipStatus('submitted','self_managed')).toMatchObject({label:'In review',owner:'Fleming'});
  expect(ownershipStatus('rejected','self_managed','Name does not match')).toMatchObject({label:'Action needed',next:expect.stringContaining('Name does not match')});
  expect(ownershipStatus('verified','self_managed').label).toBe('Approved');
  expect(ownershipStatus(null,'fleming').label).toBe('Approved');
 });
});

describe('portfolio-only access',()=>{
 it('no Rentro module calls the letting-service gate',()=>{
  for(const file of fs.readdirSync(__dirname).filter(f=>/^rentro.*\.ts$/.test(f)&&!f.endsWith('.test.ts')))
   expect(fs.readFileSync(path.join(__dirname,file),'utf8'),file).not.toMatch(/serviceGate\(|from '\.\/service-agreements'/);
 });
});
