import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn()}));
import {query} from './db-pg';
import {fastRentAnswer,propertyRentQuestion,rentLookupText} from './flemo-rent';
import {matchFlemoRecords} from './flemo-lookup';
const properties=[{id:10,name:'99 Ringwood Road, Wolverhampton',postcode:'WV10 9ER',entity:'properties'}];
const question='what date is ringwood roads rent due on and are there any missing payments';
beforeEach(()=>{vi.resetAllMocks();vi.useRealTimers();});
function fixture(charges:any[]=[],occupants:any[]=[{id:19,name:'Fictional Tenant',due_day:5,derived_from_start:false}]){
 vi.mocked(query).mockResolvedValueOnce(properties).mockResolvedValueOnce([]).mockResolvedValueOnce(occupants).mockResolvedValueOnce(charges);
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
}
it('matches the exact reported wording without confusing house numbers',()=>{
 expect(matchFlemoRecords(properties,rentLookupText(question)).map(r=>r.id)).toEqual([10]);
 expect(matchFlemoRecords(properties,rentLookupText("98 Ringwood Road's rent due date"))).toEqual([]);
});
it('keeps actions and portfolio-wide questions on their existing paths',()=>{
 expect(propertyRentQuestion('send a rent overdue email')).toBe(false);
 expect(propertyRentQuestion('total rent due across all properties')).toBe(false);
 expect(propertyRentQuestion(question)).toBe(true);
});
it('does not access finance without permission',async()=>{
 expect(await fastRentAnswer(question,'all',{},false)).toBeNull();expect(query).not.toHaveBeenCalled();
});
it('leaves rent review reminders on the review route without reading balances',async()=>{
 for(const message of ['Which rent reviews are due this month?','When is the rent review due?','Which reviews of rent are due?']){
  expect(propertyRentQuestion(message)).toBe(false);
  expect(await fastRentAnswer(message,'all',{},true)).toBeNull();
 }
 expect(query).not.toHaveBeenCalled();
});
it('answers due day, overdue part payment and today separately with property-scoped queries',async()=>{
 fixture([{id:1,due_date:'2026-09-05',amount_paid:300,outstanding:800},{id:2,due_date:'2026-10-05',amount_paid:0,outstanding:1100}]);
 const answer=await fastRentAnswer(question,'internal',{},true);
 expect(answer?.text).toContain('5th of each month');expect(answer?.text).toContain('1 recorded overdue charge, with £800.00 outstanding');
 expect(answer?.text).toContain('£1,100.00 is due today');expect(answer?.text).toContain('(part-paid)');
 expect(answer?.actions).toHaveLength(1);
 expect(vi.mocked(query).mock.calls[0][1]).toEqual(['internal']);
 expect(vi.mocked(query).mock.calls[3][1]).toEqual([10,'2026-10-05']);
 expect(vi.mocked(query).mock.calls[3][0]).toContain('r.property_id=$1 AND r.due_date<=$2::date');
});
it('does not mistake missing charge history for fully paid rent',async()=>{
 fixture();const answer=await fastRentAnswer(question,'all',{},true);
 expect(answer?.text).toContain('cannot confirm whether any payments are missing');expect(answer?.text).not.toContain('No overdue balance');
});
it('reports paid recorded charges without claiming every payment is present',async()=>{
 fixture([{id:1,due_date:'2026-09-05',outstanding:0,amount_paid:1100}]);
 const answer=await fastRentAnswer(question,'all',{},true);expect(answer?.text).toContain('No overdue balance is recorded');expect(answer?.text).toContain('an unrecorded charge or receipt');
});
it('asks which property before reading charges when a street is ambiguous',async()=>{
 vi.mocked(query).mockResolvedValueOnce([...properties,{id:11,name:'9 Ringwood Road',entity:'properties'}]).mockResolvedValueOnce([]);
 const answer=await fastRentAnswer(question,'all',{},true);expect(answer?.text).toContain('Which property');expect(query).toHaveBeenCalledTimes(2);
});
it('does not read balances for a property outside the selected portfolio',async()=>{
 vi.mocked(query).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
 const answer=await fastRentAnswer(question,'external',{},true);expect(answer?.text).toContain('selected portfolio');expect(query).toHaveBeenCalledTimes(2);
});
it('uses a tenant context to find the property and counts joint due days once',async()=>{
 fixture([], [{id:18,name:'One Test',due_day:5},{id:19,name:'Two Test',due_day:5}]);
 vi.mocked(query).mockReset().mockResolvedValueOnce(properties).mockResolvedValueOnce([{id:19,name:'Zoe Example',entity:'tenants',property_id:10}]).mockResolvedValueOnce([{due_day:5},{due_day:5}]).mockResolvedValueOnce([]);
 const answer=await fastRentAnswer('When is this tenant rent due?','all',{entityType:'tenant',entityId:19},true);expect(answer?.text.match(/5th of each month/g)).toHaveLength(1);
});
it('flags inconsistent due days instead of choosing one',async()=>{
 fixture([],[{due_day:5},{due_day:6}]);expect((await fastRentAnswer(question,'all',{},true))?.text).toContain('missing or inconsistent');
});
it('explains month-end and derived billing days',async()=>{
 fixture([],[{due_day:31,derived_from_start:true}]);const answer=await fastRentAnswer(question,'all',{},true);expect(answer?.text).toContain('last day of a shorter month');expect(answer?.text).toContain('derived from the tenancy start date');
});
