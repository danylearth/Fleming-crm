import {describe,expect,it} from 'vitest';
import fs from 'fs';
import path from 'path';
import {flemingOperatedSql,flemingOperatedRowSql} from './fleming-operated';

const source=(file:string)=>fs.readFileSync(path.join(__dirname,file),'utf8');

describe('Fleming-operated filter',()=>{
 it('selects properties Fleming operates',()=>{
  expect(flemingOperatedSql('p')).toBe("p.management_mode = 'fleming'");
  expect(flemingOperatedSql('properties')).toBe("properties.management_mode = 'fleming'");
 });
 it('keeps rows without a property and drops rows on self-managed properties',()=>{
  expect(flemingOperatedRowSql('t')).toBe("NOT EXISTS (SELECT 1 FROM properties fo WHERE fo.id = t.property_id AND fo.management_mode <> 'fleming')");
 });
 it('refuses anything that is not a plain SQL alias',()=>{
  expect(()=>flemingOperatedSql("p; DROP TABLE properties")).toThrow('Invalid SQL alias');
  expect(()=>flemingOperatedRowSql('T')).toThrow('Invalid SQL alias');
 });
 it('is applied by every job that bills, reminds or counts on Fleming’s behalf',()=>{
  // Rent charges and invoices (three queries), staff reminder tasks, inventory tasks and dashboard alerts.
  expect(source('finance-scheduler.ts').match(/flemingOperatedSql\('p'\)/g)).toHaveLength(3);
  const scheduler=source('scheduler-pg.ts');
  for(const fn of ['runComplianceChecks','runTenancyEndChecks','runRentReviewChecks','runNokChecks']){
   const body=scheduler.slice(scheduler.indexOf(`async function ${fn}`)).split(/\nasync function /)[0];
   expect(body,fn).toMatch(/flemingOperated(Row)?Sql\(/);
  }
  expect(source('tenant-lifecycle-db.ts')).toContain("'inventory_due','tenant',t.id\r\n    FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.status='active' AND p.archived_at IS NULL AND ${flemingOperatedSql('p')}");
  expect(source('dashboard-alerts.ts').match(/flemingOperatedSql\('properties'\)/g)).toHaveLength(3);
 });
});
