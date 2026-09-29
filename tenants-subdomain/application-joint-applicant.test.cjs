const test = require('node:test');
const assert = require('node:assert/strict');
const prefill = require('./application-joint-applicant.js');
test('prefills a partner and enriches a saved name without shifting the birth date', () => {
    const partner = { name:'Jamie Taylor', date_of_birth:'1958-11-22T00:00:00.000Z' };
    assert.equal(prefill('', partner), 'Jamie Taylor - 22/11/1958');
    assert.equal(prefill('Jamie Taylor', partner), 'Jamie Taylor - 22/11/1958');
    assert.equal(prefill('', {name:'Casey Taylor',date_of_birth:'22/11/1958'}), 'Casey Taylor - 22/11/1958');
});
test('preserves existing dates, additional applicants and manually entered details', () => {
    const partner = {name:'Jamie Taylor',date_of_birth:'1958-11-22'};
    for (const saved of ['Jamie Taylor - 23/11/1958', 'Jamie Taylor\nAlex Smith', 'Jamie Taylor (partner)']) assert.equal(prefill(saved,partner),saved);
});
test('does not invent missing dates or applicant names', () => {
    assert.equal(prefill('',{name:'Jamie Taylor'}),'Jamie Taylor');
    assert.equal(prefill('',null),'');
    assert.equal(prefill('Alex Smith',null),'Alex Smith');
});
