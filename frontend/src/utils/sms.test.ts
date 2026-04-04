import { describe, it, expect } from 'vitest';
import { calculateSmsSegments } from './sms';

describe('calculateSmsSegments', () => {
  it('returns zero segments for empty string', () => {
    const result = calculateSmsSegments('');
    expect(result).toEqual({
      charCount: 0,
      encoding: 'GSM-7',
      segments: 0,
      charsPerSegment: 160,
      charsRemaining: 160,
    });
  });

  it('handles single GSM-7 segment', () => {
    const result = calculateSmsSegments('Hello World');
    expect(result.encoding).toBe('GSM-7');
    expect(result.segments).toBe(1);
    expect(result.charCount).toBe(11);
    expect(result.charsPerSegment).toBe(160);
    expect(result.charsRemaining).toBe(149);
  });

  it('handles exactly 160 GSM-7 characters as one segment', () => {
    const text = 'A'.repeat(160);
    const result = calculateSmsSegments(text);
    expect(result.segments).toBe(1);
    expect(result.charsPerSegment).toBe(160);
    expect(result.charsRemaining).toBe(0);
  });

  it('handles 161 GSM-7 characters as two segments (153 chars per)', () => {
    const text = 'A'.repeat(161);
    const result = calculateSmsSegments(text);
    expect(result.segments).toBe(2);
    expect(result.charsPerSegment).toBe(153);
    expect(result.charsRemaining).toBe(306 - 161); // 145
  });

  it('counts GSM extension characters as 2 slots', () => {
    // { } are GSM extension chars, each takes 2 slots
    const result = calculateSmsSegments('{}');
    expect(result.encoding).toBe('GSM-7');
    expect(result.charCount).toBe(4); // 2 chars * 2 slots each
  });

  it('switches to UCS-2 for non-GSM characters', () => {
    const result = calculateSmsSegments('Hello \u{1F600}'); // emoji
    expect(result.encoding).toBe('UCS-2');
    expect(result.charsPerSegment).toBe(70);
  });

  it('handles single UCS-2 segment up to 70 chars', () => {
    const result = calculateSmsSegments('\u4E2D'.repeat(70)); // Chinese char
    expect(result.encoding).toBe('UCS-2');
    expect(result.segments).toBe(1);
    expect(result.charsPerSegment).toBe(70);
    expect(result.charsRemaining).toBe(0);
  });

  it('splits UCS-2 into multi-segment at 67 chars per segment', () => {
    const text = '\u4E2D'.repeat(71);
    const result = calculateSmsSegments(text);
    expect(result.encoding).toBe('UCS-2');
    expect(result.segments).toBe(2);
    expect(result.charsPerSegment).toBe(67);
  });

  it('handles typical SMS template text', () => {
    const text = 'Hi John, your property viewing at 123 Main St has been confirmed for 2026-04-03 at 10:00. Please arrive on time. - Fleming Lettings';
    const result = calculateSmsSegments(text);
    expect(result.encoding).toBe('GSM-7');
    expect(result.segments).toBe(1);
    expect(result.charCount).toBeLessThanOrEqual(160);
  });

  it('handles GSM special characters correctly', () => {
    // @ is in GSM basic set, not extension
    const result = calculateSmsSegments('@');
    expect(result.encoding).toBe('GSM-7');
    expect(result.charCount).toBe(1);

    // Euro sign is in GSM extension
    const euro = calculateSmsSegments('\u20AC');
    expect(euro.encoding).toBe('GSM-7');
    expect(euro.charCount).toBe(2); // extension char = 2 slots
  });

  it('handles pipe character as GSM extension', () => {
    const result = calculateSmsSegments('|');
    expect(result.encoding).toBe('GSM-7');
    expect(result.charCount).toBe(2);
  });
});
