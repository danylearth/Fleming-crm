import {it,expect} from 'vitest';
import {handoverLocation,mainOfficeAddress} from './handover-location';
import {handoverAppointmentEmail} from './email';
it('defaults to the property and supports each department office or a custom address',()=>{
 const offices=[{id:1,name:'Lettings',office_address:'1 Example Street'},{id:2,name:'Accounts',office_address:'2 Sample Road'}];
 expect(handoverLocation(undefined,undefined,'24 Example Gardens',offices).address).toBe('24 Example Gardens');
 expect(handoverLocation('office',null,'',offices).address).toBe(mainOfficeAddress);
 expect(handoverLocation('office:1','Fake address','',offices).address).toBe('1 Example Street');
 expect(handoverLocation('office:2',null,'',offices).address).toBe('2 Sample Road');
 expect(handoverLocation('other','  9 Alternative Road  ','',offices).address).toBe('9 Alternative Road');
 expect(()=>handoverLocation('other','','',offices)).toThrow();expect(()=>handoverLocation('office:3','Fake address','',offices)).toThrow();
});
it('shows the selected meeting location in the appointment and both map links',()=>{
 const {html}=handoverAppointmentEmail({firstName:'Alex',propertyAddress:'24 Example Gardens',appointmentLocation:'9 Alternative Road, EX1 2AB',appointmentDate:'2026-09-28',appointmentTime:'10:00',appointmentWith:'Casey'});
 expect(html).toContain('9 Alternative Road, EX1 2AB');expect(html).toContain('query=9%20Alternative%20Road%2C%20EX1%202AB');expect(html).toContain('q=9%20Alternative%20Road%2C%20EX1%202AB');expect(html).not.toContain('{{');
});
