import { describe,it,expect } from 'vitest';
import { addMonths,validateRentDates } from './rent-review';
describe('monthly rent increase dates',()=>{
  it('clamps calendar months including leap years',()=>{expect(addMonths('2026-12-31',2)).toBe('2027-02-28');expect(addMonths('2024-02-29',12)).toBe('2025-02-28');});
  it('enforces service notice, annual spacing, valid dates and period boundaries',()=>{
    const check=(served: unknown,effective:unknown,last: unknown=null)=>validateRentDates('2024-01-15',served,effective,last,'2026-09-09');
    expect(check('2026-09-01','2026-11-15')).toBeNull();
    expect(check('2026-09-01','2026-10-15')).toMatch(/two calendar/);
    expect(check('2026-09-10','2026-12-15')).toMatch(/already served/);
    expect(check('2026-09-01','2026-11-14')).toMatch(/tenancy period/);
    expect(check('2026-09-01','2026-11-15','2026-01-15')).toMatch(/12 months/);
    expect(check('2026-02-30','2026-11-15')).toMatch(/valid/);
    expect(check('2026-06-01','2026-08-15')).toMatch(/past/);
    expect(validateRentDates('2026-01-15','2026-09-01','2026-11-15',null,'2026-09-09')).toMatch(/12 months/);
  });
});
