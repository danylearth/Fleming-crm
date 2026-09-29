const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applicationDeadline}=require('./application-deadline');
const sent='2026-09-29T14:23:54.762Z',start=Date.parse(sent),day=86400000;
test('counts complete 24-hour periods from sending, not calendar dates',()=>{
 assert.equal(applicationDeadline(sent,start).label,'7 days');
 assert.equal(applicationDeadline(sent,start+day-1).label,'7 days');
 for(let elapsed=1;elapsed<=5;elapsed++)assert.equal(applicationDeadline(sent,start+elapsed*day).label,`${7-elapsed} days`);
});
test('shows 24 hours throughout the final day, then an expired notice',()=>{
 assert.deepEqual(applicationDeadline(sent,start+6*day),{label:'24 hours',expired:false});
 assert.deepEqual(applicationDeadline(sent,start+7*day-1),{label:'24 hours',expired:false});
 assert.equal(applicationDeadline(sent,start+7*day).expired,true);
});
test('handles missing timestamps and does not extend above seven days for a clock difference',()=>{
 assert.equal(applicationDeadline(null,start).label,'7 days');
 assert.equal(applicationDeadline('invalid',start).label,'7 days');
 assert.equal(applicationDeadline(sent,start-1000).label,'7 days');
});
