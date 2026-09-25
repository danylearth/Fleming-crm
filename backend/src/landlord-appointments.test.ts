import {it,expect} from 'vitest';
import {appointmentDetails,appointmentMessage} from './landlord-appointments';
it('requires a valid future meeting date, time and location',()=>{
 for(const body of [{kind:'meeting',date:'2026-02-30',time:'10:00',location:'Office'},{kind:'meeting',date:'2026-10-01',time:'25:00',location:'Office'},{kind:'meeting',date:'2026-10-01',time:'10:00'}])expect(()=>appointmentDetails(body,'2026-09-25')).toThrow();
});
it('supports date-only follow-ups and clearly states meeting location and UK time',()=>{
 expect(appointmentDetails({kind:'follow_up',date:'2026-10-01'},'2026-09-25').time).toBe('');
 const d=appointmentDetails({kind:'meeting',date:'2026-10-01',time:'10:30',location:'Office'},'2026-09-25');expect(appointmentMessage('Sample',d)).toContain('10:30 (UK time) at Office');
});
it('includes the selected office address in landlord confirmations',()=>{
 const location='Creative Industries Centre, Wolverhampton Science Park, WV10 9TG';
 const details=appointmentDetails({kind:'meeting',date:'2026-10-01',time:'10:30',location},'2026-09-25');
 expect(appointmentMessage('Sample',details)).toContain(location);
});
