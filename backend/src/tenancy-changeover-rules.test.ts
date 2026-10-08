import {expect,it} from 'vitest';
import {changeoverDates,changeoverState,validateChangeoverApplicants} from './tenancy-changeover-rules';

it('uses the previous calendar day across leap days and year boundaries',()=>{
 expect(changeoverDates('2026-11-06','2026-02-06')).toEqual({start:'2026-11-06',previousEnd:'2026-11-05'});
 expect(changeoverDates('2028-03-01','2027-01-01').previousEnd).toBe('2028-02-29');
 expect(changeoverDates('2027-01-01','2026-01-01').previousEnd).toBe('2026-12-31');
 for(const date of ['2026-02-29','2026-13-01','2026-02-06',''])expect(()=>changeoverDates(date,'2026-02-06')).toThrow();
});
it('retires completed onboarding on the start date, including after a delayed scheduler restart',()=>{
 expect(changeoverState('2026-11-06','2026-11-05')).toBe('scheduled');
 expect(changeoverState('2026-11-06','2026-11-06')).toBe('active');
 expect(changeoverState('2026-11-06','2026-11-08')).toBe('active');
});
const applicants=[{id:84,source_tenant_id:999,linked_property_id:10,application_form_completed:1,application_review_status:'approved',credit_check_completed:1}];
const agreement={status:'completed',signed_filename:'signed.pdf',property_id:10};
const existing=[{id:998,linked_tenant_id:999,status:'active',property_id:10},{id:999,linked_tenant_id:998,status:'active',property_id:10}];
it('reuses the continuing person and allows the outgoing joint tenant to remain in history',()=>{
 expect(validateChangeoverApplicants(applicants,agreement,existing)).toEqual([999]);
});
it('rejects duplicate people, incomplete checks, unsigned documents and unrelated property occupants',()=>{
 expect(()=>validateChangeoverApplicants([...applicants,...applicants],agreement,existing)).toThrow();
 expect(()=>validateChangeoverApplicants([{...applicants[0],credit_check_completed:0}],agreement,existing)).toThrow();
 expect(()=>validateChangeoverApplicants(applicants,{...agreement,status:'awaiting_tenant'},existing)).toThrow();
 expect(()=>validateChangeoverApplicants(applicants,{...agreement,signed_filename:null},existing)).toThrow();
 expect(()=>validateChangeoverApplicants(applicants,agreement,[{...existing[0],linked_tenant_id:null},existing[1]])).toThrow();
 expect(()=>validateChangeoverApplicants(applicants,agreement,[existing[0],{...existing[1],property_id:11}])).toThrow();
});
