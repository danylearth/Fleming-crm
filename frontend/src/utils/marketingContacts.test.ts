import {describe,it,expect} from 'vitest';
import {groupMarketingContacts} from './marketingContacts';
const contact={entity_type:'tenant',id:1,name:'Sample Person',email:'Person@example.test',phone:'07700 900123',audience:'Former Tenants',email_allowed:true,sms_allowed:true};
describe('marketing contact selection',()=>{
 it('shows a converted enquiry and tenant once while preserving both record links',()=>{
  const rows=groupMarketingContacts([contact,{...contact,entity_type:'tenant_enquiry',email:' person@EXAMPLE.test ',audience:'Closed Tenant Enquiries'}],'email');
  expect(rows).toHaveLength(1);expect(rows[0].recordKeys).toEqual(['tenant:1','tenant_enquiry:1']);expect(rows[0].audiences).toHaveLength(2);
 });
 it('deduplicates UK phone formatting and keeps distinct destinations separate',()=>{
  expect(groupMarketingContacts([contact,{...contact,id:2,phone:'+44 7700 900123'},{...contact,id:3,phone:'00447700900123'}],'sms')).toHaveLength(1);
  expect(groupMarketingContacts([contact,{...contact,id:2,email:'different@example.test'}],'email')).toHaveLength(2);
 });
 it('does not merge people by name or silently override opt-outs',()=>{
  expect(groupMarketingContacts([contact,{...contact,id:2,email:''},{...contact,id:3,email:''}],'email')).toHaveLength(3);
  expect(groupMarketingContacts([contact,{...contact,id:2,email_allowed:false}],'email')[0].email_allowed).toBe(false);
 });
});
