import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCsv('name,addr\nJo,"1 High St, Leeds"')).toEqual([
      ['name', 'addr'],
      ['Jo', '1 High St, Leeds'],
    ]);
  });

  it('handles embedded newlines in quoted fields', () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([['a', 'b'], ['line1\nline2', 'x']]);
  });

  it('handles escaped quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('ignores trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n,2,')).toEqual([['a', '', 'c'], ['', '2', '']]);
  });

  it('returns empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => parseCsv('name,notes\nJo,"never closed')).toThrow('Unterminated quoted field');
  });
});
