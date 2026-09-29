import {expect,it} from 'vitest';
import {noteDisplayText} from './noteDisplay';
it('unwraps legacy notes with appended prose without losing either text',()=>{
 expect(noteDisplayText('[{"text":"Original [note]","author":"Office"}]\nAdditional note')).toBe('Original [note]\nAdditional note');
});
it('preserves ordinary or malformed text',()=>{
 for(const text of ['Ordinary note','[not JSON]','[{"unrelated":"data"}]'])expect(noteDisplayText(text)).toBe(text);
});
