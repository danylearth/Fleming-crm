import { describe,it,expect } from 'vitest';
import { validFeedbackAnchor } from './feedback';
describe('feedback page anchors',()=>{
 const pin={selector:'main > h1',label:'Calendar',x:.5,y:.5,pageX:.5,pageY:.25};
 it('allows general page comments and bounded pins',()=>{expect(validFeedbackAnchor(null)).toBe(true);expect(validFeedbackAnchor(pin)).toBe(true);});
 it('rejects nonfinite coordinates, huge selectors and malformed pins',()=>{for(const p of [{...pin,x:Infinity},{...pin,y:-1},{...pin,pageY:1.1},{...pin,selector:'x'.repeat(701)},[],{}])expect(validFeedbackAnchor(p)).toBe(false);});
});
