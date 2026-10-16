import {describe,expect,it} from 'vitest';
import fs from 'fs';
import path from 'path';
import {TASK_TYPES,taskTypeCheckSql} from './task-types';

// Types the code compares against or indexes on must be allowed by the tasks_task_type_check constraint,
// otherwise inserting them fails on a database where the constraint is in force (e.g. a fresh staging DB).
function referencedTaskTypes(dir:string,ext:string){
 const found=new Set<string>();
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith(ext)&&!f.endsWith('.test.ts'))){
  const text=fs.readFileSync(path.join(dir,file),'utf8');
  for(const m of text.matchAll(/task_type\s*=\s*'([a-z_]+)'/g))found.add(m[1]);
  for(const m of text.matchAll(/task_type\s+IN\s*\(([^)]*)\)/g))for(const v of m[1].matchAll(/'([a-z_]+)'/g))found.add(v[1]);
 }
 return found;
}

describe('task types',()=>{
 it('allows every task type the code and migrations refer to',()=>{
  const referenced=new Set([...referencedTaskTypes(__dirname,'.ts'),...referencedTaskTypes(path.join(__dirname,'../migrations'),'.sql')]);
  expect(referenced.size).toBeGreaterThan(10);
  for(const type of referenced)expect(TASK_TYPES,`task type ${type}`).toContain(type);
 });
 it('includes the types created by inventory, insurance, inspection and landlord appointment workflows',()=>{
  for(const type of ['inventory_due','insurance_renewal','property_inspection','landlord_meeting','landlord_follow_up'])expect(TASK_TYPES).toContain(type);
 });
 it('builds the constraint from a duplicate-free list that still allows NULL',()=>{
  expect(new Set(TASK_TYPES).size).toBe(TASK_TYPES.length);
  expect(taskTypeCheckSql()).toMatch(/^task_type IN \('manual', .*'rentro_passport_review', NULL\)$/);
 });
});
