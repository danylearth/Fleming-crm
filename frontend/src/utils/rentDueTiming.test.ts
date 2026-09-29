import {it,expect} from 'vitest';
import {rentDueTiming} from './rentDueTiming';
it('distinguishes overdue, due today and advance rent by calendar day',()=>{
 expect(rentDueTiming('2026-09-28','2026-09-29').label).toBe('Overdue');
 expect(rentDueTiming('2026-09-29T00:00:00Z','2026-09-29').label).toBe('Due today');
 expect(rentDueTiming('2026-10-05','2026-09-29').label).toBe('In advance');
});
