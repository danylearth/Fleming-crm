import {describe,it,expect} from 'vitest';
import {nextInspectionDate,hasPropertyInspections} from './property-inspections';
describe('property inspection schedule',()=>{
 it('uses three months, six months, then twelve-month intervals from the six-month visit',()=>{
  expect(nextInspectionDate('2026-09-21')).toBe('2026-12-21');
  expect(nextInspectionDate('2026-09-21','2026-12-21')).toBe('2027-03-21');
  expect(nextInspectionDate('2026-09-21','2027-03-21')).toBe('2028-03-21');
  expect(nextInspectionDate('2026-09-21','2028-03-21')).toBe('2029-03-21');
 });
 it('clamps short months, restores original day and advances after a late inspection',()=>{
  expect(nextInspectionDate('2023-11-30')).toBe('2024-02-29');
  expect(nextInspectionDate('2023-11-30','2024-02-29')).toBe('2024-05-30');
  expect(nextInspectionDate('2023-11-30','2025-06-01')).toBe('2026-05-30');
 });
 it('includes own portfolio/full management and excludes rent collection and let only clients',()=>{
  expect(hasPropertyInspections({landlord_type:'internal'})).toBe(true);
  expect(hasPropertyInspections({landlord_type:'external',service_type:'full_management'})).toBe(true);
  expect(hasPropertyInspections({landlord_type:'external',service_type:'rent_collection'})).toBe(false);
  expect(hasPropertyInspections({landlord_type:'external',service_type:'let_only'})).toBe(false);
 });
});
