import {expect,it} from 'vitest';
import {createNotificationAttention} from './notificationAttention';
it('alerts on sign-in, preserves highlight across pages, and stops after opening',()=>{
 const tracker=createNotificationAttention();
 expect(tracker.observe('session-1',['a'])).toMatchObject({first:true,alert:true,attention:true});
 expect(tracker.observe('session-1',['a'])).toMatchObject({alert:false,attention:true});
 tracker.acknowledge();
 expect(tracker.observe('session-1',['a'])).toMatchObject({alert:false,attention:false});
 expect(tracker.observe('session-2',['a'])).toMatchObject({first:true,alert:true,attention:true});
});
it('detects a new item even when the count is unchanged and ignores removal or reorder',()=>{
 const tracker=createNotificationAttention();tracker.observe('session',['a','b']);tracker.acknowledge();
 expect(tracker.observe('session',['b','a']).alert).toBe(false);
 expect(tracker.observe('session',['b','c'])).toMatchObject({added:['c'],alert:true});
 expect(tracker.observe('session',['c']).alert).toBe(false);
 expect(tracker.observe('session',[])).toMatchObject({alert:false,attention:false});
 expect(tracker.observe('session',['d']).alert).toBe(true);
});
