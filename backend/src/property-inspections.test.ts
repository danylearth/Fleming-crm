import {describe,it,expect} from 'vitest';
import {nextInspectionDate,hasPropertyInspections,inspectionAnswers,inspectionConditions} from './property-inspections';
describe('property inspection schedule',()=>{
 it('uses three, six, twelve months and then annual anniversaries',()=>{
  expect(nextInspectionDate('2026-09-21')).toBe('2026-12-21');
  expect(nextInspectionDate('2026-09-21','2026-12-21')).toBe('2027-03-21');
  expect(nextInspectionDate('2026-09-21','2027-03-21')).toBe('2027-09-21');
  expect(nextInspectionDate('2026-09-21','2028-03-21')).toBe('2028-09-21');
 });
 it('clamps short months, restores original day and advances after a late inspection',()=>{
  expect(nextInspectionDate('2023-11-30')).toBe('2024-02-29');
  expect(nextInspectionDate('2023-11-30','2024-02-29')).toBe('2024-05-30');
  expect(nextInspectionDate('2023-11-30','2025-06-01')).toBe('2025-11-30');
 });
 it('includes own portfolio/full management and excludes rent collection and let only clients',()=>{
  expect(hasPropertyInspections({landlord_type:'internal'})).toBe(true);
  expect(hasPropertyInspections({landlord_type:'external',service_type:'full_management'})).toBe(true);
  expect(hasPropertyInspections({landlord_type:'external',service_type:'rent_collection'})).toBe(false);
  expect(hasPropertyInspections({landlord_type:'external',service_type:'let_only'})).toBe(false);
 });
});

describe('inspection answers',()=>{
 it.each(['average','very_good'])('accepts %s across overall and detailed condition answers',rating=>{expect(inspectionConditions).toContain(rating);expect(inspectionAnswers({internal_condition:rating,external_condition:rating,damage_noticed:false})).toMatchObject({internal_condition:rating,external_condition:rating});});
 it('rejects an unrecognised condition',()=>{expect(()=>inspectionAnswers({internal_condition:'unknown',external_condition:'good',damage_noticed:false})).toThrow('internal condition');});
 it('requires the CRM answers even if a report is attached',()=>{expect(()=>inspectionAnswers({document_id:12})).toThrow();});
 it('accepts a complete form without an attachment',()=>{expect(inspectionAnswers({internal_condition:'good',external_condition:'not_applicable',damage_noticed:false})).toEqual({internal_condition:'good',external_condition:'not_applicable',damage_noticed:false,damage_details:null});});
 it('requires damage details and an explicit yes or no',()=>{expect(()=>inspectionAnswers({internal_condition:'good',external_condition:'good'})).toThrow();expect(()=>inspectionAnswers({internal_condition:'good',external_condition:'good',damage_noticed:true})).toThrow('Describe');});
});
