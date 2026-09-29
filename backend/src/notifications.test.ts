import {describe,it,expect,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn(),run:vi.fn()}));
import {notificationForTask,notificationForEvent,notificationsForEvents,notificationTaskResolved,userNotifications,registerNotifications} from './notifications';
const base={id:1,title:'Check document',status:'pending',priority:'medium',due_date:'2026-09-30',workflow:'external',label:'Sample property'};
describe('notification lifecycle',()=>{
 it('shows assigned ordinary tasks on their due day and keeps overdue work visible',()=>{
  expect(notificationForTask(base,'2026-09-29')).toBeNull();
  expect(notificationForTask(base,'2026-09-30')?.kind).toBe('task');
  expect(notificationForTask(base,'2026-10-01')).not.toBeNull();
  expect(notificationForTask({...base,status:'completed'},'2026-10-01')).toBeNull();
 });
 it('shows generated compliance reminders before expiry without mixing workflows',()=>{
  expect(notificationForTask({...base,task_type:'eicr_reminder'},'2026-09-29')).toMatchObject({kind:'reminder',workflow:'external',canDismiss:true});
 });
 it('requires both an advanced valid expiry and the replacement document to clear EICR',()=>{
  const row={...base,task_type:'eicr_reminder',property_data:{eicr_expiry_date:'2031-09-30'}};
  expect(notificationTaskResolved(row,'2026-09-29')).toBe(false);
  expect(notificationTaskResolved({...row,renewal_document:true},'2026-09-29')).toBe(true);
  expect(notificationTaskResolved({...row,property_data:{eicr_expiry_date:'2026-09-30'},renewal_document:true},'2026-09-29')).toBe(false);
 });
 it('removes reviewed applications and reviewed uploads, but retains unresolved activity',()=>{
  const event={id:5,changes:{action:'application_form_completed'},created_at:'2026-09-29',label:'Applicant',href:'/enquiries/5',workflow:'internal'};
  expect(notificationForEvent(event)).toMatchObject({key:'activity:5',workflow:'internal',canDismiss:true});
  expect(notificationForEvent({...event,review_status:'approved'})).toBeNull();
  expect(notificationForEvent({...event,action:'document_upload',changes:{},document_status:'approved'})).toBeNull();
 });
});

import {query,run} from './db-pg';
const testUser={id:44,name:'Sample Staff',email:'staff@example.test',role:'staff'};
it('groups both completed applicants into one review item and resurfaces a later resubmission',()=>{
 const jamie={id:83,joint_partner_id:84,first_name_1:'Jamie',last_name_1:'Taylor',application_form_completed:1,application_review_status:'pending'};
 const casey={...jamie,id:84,joint_partner_id:83,first_name_1:'Casey'};
 const first={id:10,changes:{action:'application_form_completed'},created_at:'2026-09-29T12:00:00Z',application:jamie,partner_application:casey};
 const second={...first,id:11,created_at:'2026-09-29T13:00:00Z',application:casey,partner_application:jamie};
 expect(notificationsForEvents([{...first,partner_application:{...casey,application_form_completed:0}}])).toEqual([]);
 expect(notificationsForEvents([first,second])).toMatchObject([{key:'activity:11',title:'Joint application ready for review',detail:'Jamie Taylor & Casey Taylor'}]);
 expect(notificationsForEvents([{...second,application:{...casey,application_review_status:'approved'},partner_application:{...jamie,application_review_status:'approved'}}])).toEqual([]);
 expect(notificationsForEvents([{...second,id:12,changes:{action:'application_form_revised'},partner_application:{...jamie,application_review_status:'approved'}}])).toMatchObject([{key:'activity:12'}]);
 expect(notificationsForEvents([{...second,application:{...casey,application_review_status:'changes_requested',application_changes_sent_at:'2026-09-29'}}])).toEqual([]);
});
function mockFeed(){vi.mocked(query).mockImplementation(async(sql:string,params?:any[])=>{
 if(sql.includes('SELECT t.*,e.label'))return [{...base,due_date:'2026-01-01'}];
 if(sql.includes('SELECT event.id'))return [];
 if(sql.startsWith('SELECT notification_key'))return params?.[0]===45?[{notification_key:'task:1:2026-01-01'}]:[];
 return [];
});}
it('clears only the current user’s notification and exposes a later cycle',async()=>{
 mockFeed();expect((await userNotifications(testUser)).map(n=>n.key)).toEqual(['task:1:2026-01-01']);
 expect(await userNotifications({...testUser,id:45})).toEqual([]);
});
it('clear all stores dismissals without closing or changing any tasks',async()=>{
 mockFeed();vi.mocked(run).mockClear();const routes:Record<string,any>={};registerNotifications({get:vi.fn(),post:(path:string,...handlers:any[])=>{routes[path]=handlers[handlers.length-1];}} as any);
 const res={json:vi.fn()};await routes['/api/notifications/clear']({user:testUser},res);
 expect(run).toHaveBeenCalledExactlyOnceWith('INSERT INTO notification_dismissals(user_id,notification_key) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[44,['task:1:2026-01-01']]);
 expect(res.json).toHaveBeenCalledWith({success:true,cleared:1});
});
it('does not reveal an older joint completion after dismissal, but shows a new revision',async()=>{
 const application={id:83,joint_partner_id:84,first_name_1:'Jamie',application_form_completed:1,application_review_status:'pending'};
 const partner={...application,id:84,joint_partner_id:83,first_name_1:'Casey'};
 const event={id:10,created_at:'2026-09-29T12:00:00Z',changes:{action:'application_form_completed'},application,partner_application:partner};
 let events=[event,{...event,id:11}];
 vi.mocked(query).mockImplementation(async(sql:string)=>sql.includes('SELECT event.id')?events:sql.startsWith('SELECT notification_key')?[{notification_key:'activity:11'}]:[]);
 expect(await userNotifications(testUser)).toEqual([]);
 events=[...events,{...event,id:12,changes:{action:'application_form_revised'}}];
 expect(await userNotifications(testUser)).toMatchObject([{key:'activity:12'}]);
});
