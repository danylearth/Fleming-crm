import {describe,it,expect} from 'vitest';
import {newestNotesFirst} from './notes';
describe('record notes',()=>{
 it('places the latest timestamp first without changing the saved notes',()=>{
  const notes=[{id:1,created_at:'2026-10-05T21:00:00Z'},{id:2,created_at:'2026-10-06T07:15:00Z'},{id:3,created_at:'2026-10-06T07:14:00Z'}];
  expect(newestNotesFirst(notes).map(n=>n.id)).toEqual([2,3,1]);
  expect(notes.map(n=>n.id)).toEqual([1,2,3]);
 });
 it('keeps undated legacy notes after dated notes and preserves ties',()=>{
  expect(newestNotesFirst([{id:1,created_at:''},{id:2,created_at:'bad'},{id:3,created_at:'2026-10-06'},{id:4,created_at:'2026-10-06'}]).map(n=>n.id)).toEqual([3,4,1,2]);
 });
});
