import {describe,it,expect} from 'vitest';
import {portfolioMatcher} from './dashboardPortfolio';
const records={properties:[{id:1,landlord_type:'internal'},{id:2,landlord_type:'external'}],tenants:[{id:3,property_id:1}],landlords:[{id:4,landlord_type:'external'}],enquiries:[{id:5,property_id:2}],maintenance:[{id:6,property_id:1}]};
describe('dashboard portfolio selection',()=>{
 it('resolves enquiry ownership through linked_property_id and gives property ownership precedence',()=>{
  const own=portfolioMatcher(records,'internal'),clients=portfolioMatcher(records,'external');
  expect(own.record({id:8,linked_property_id:1})).toBe(true);
  expect(clients.record({id:8,linked_property_id:1,landlord_type:'external'})).toBe(false);
  expect(clients.record({id:9,linked_property_id:2})).toBe(true);
  expect(own.record({id:10})).toBe(false);
  expect(clients.record({id:10})).toBe(false);
  expect(portfolioMatcher(records,'all').record({id:10})).toBe(true);
 });
 it('resolves property ownership through its landlord when the join field is missing',()=>{
  const matcher=portfolioMatcher({...records,properties:[{id:2,landlord_id:4}]},'external');
  expect(matcher.property(2)).toBe(true);
  expect(matcher.landlord(4)).toBe(true);
 });
 it('resolves each task through its linked record',()=>{
  const own=portfolioMatcher(records,'internal'),clients=portfolioMatcher(records,'external');
  for(const task of [{entity_type:'property',entity_id:1},{entity_type:'tenant',entity_id:3},{entity_type:'maintenance',entity_id:6}]){expect(own.task(task)).toBe(true);expect(clients.task(task)).toBe(false);}
  for(const task of [{entity_type:'landlord',entity_id:4},{entity_type:'tenant_enquiry',entity_id:5},{entity_type:'landlord_bdm',entity_id:7}]){expect(own.task(task)).toBe(false);expect(clients.task(task)).toBe(true);}
 });
 it('retains unlinked tasks in All without assigning them to a portfolio',()=>{
  expect(portfolioMatcher(records,'all').task({})).toBe(true);
  expect(portfolioMatcher(records,'internal').task({})).toBe(false);
  expect(portfolioMatcher(records,'external').task({entity_type:'tenant',entity_id:999})).toBe(false);
 });
 it('filters compliance property IDs and maintenance IDs independently',()=>{
  const own=portfolioMatcher(records,'internal');
  expect(own.property(1)).toBe(true);expect(own.property(2)).toBe(false);
  expect(own.maintenance(6)).toBe(true);expect(own.maintenance(1)).toBe(false);
 });
});
