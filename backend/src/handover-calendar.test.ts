import {it,expect,vi} from 'vitest';
import {syncHandoverCalendar} from './handover-calendar';
const booking={withLandlord:true,name:'Jamie Taylor',time:'10:00',location:'24 Example Gardens',assignedTo:'Alex Morgan',enquiryId:83,date:'2026-10-03'};
it('keeps landlord handovers off the staff calendar and archives a prior staff booking',async()=>{
 const query=vi.fn(async()=>({rows:[]}));await syncHandoverCalendar({query},[83,84],booking);
 expect(query).toHaveBeenCalledTimes(1);expect(query).toHaveBeenCalledWith(expect.stringContaining("status='archived'"),[[83,84]]);
});
it('adds an assigned staff handover to the calendar',async()=>{
 const query=vi.fn(async()=>({rows:[]}));await syncHandoverCalendar({query},[83,84],{...booking,withLandlord:false,assignedTo:'Marie Ellis'});
 expect(query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO tasks'),['Tenancy handover: Jamie Taylor','10:00 at 24 Example Gardens','Marie Ellis',83,'2026-10-03']);
});
