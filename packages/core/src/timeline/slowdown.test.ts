import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { microseconds, type Microseconds } from '../shared/units/units';
import { outputTime, slowdown, slowdownSegments, sourceTimeAt, type Segment } from './slowdown';

const us = (value: number): Microseconds => microseconds(value);
const range = { start: us(1_000_000), end: us(2_000_000) };

describe('slowdown', () => {
  it('accepts a factor from 1 to 16 and a range that runs forward', () => {
    expect(slowdown(2)).toEqual({ factor: 2 });
    expect(slowdown(1.5, range)).toEqual({ segments: [{ ...range, factor: 1.5 }] });
    expect(() => slowdown(0.5)).toThrow('factor must be from 1 to 16, got 0.5');
    expect(() => slowdown(17)).toThrow(RangeError);
    expect(() => slowdown(NaN)).toThrow(RangeError);
    expect(() => slowdown(2, { start: us(5), end: us(5) })).toThrow(
      'range must end after it starts, got 5 to 5',
    );
    expect(() => slowdown(2, { start: us(5), end: us(NaN) })).toThrow(RangeError);
  });
});

const seg = (start: number, end: number, factor: number): Segment => ({
  start: us(start * 1e6),
  end: us(end * 1e6),
  factor,
});

interface Piece {
  readonly gap: number;
  readonly length: number;
  readonly factor: number;
}

/** Segments laid one after another, each `gap` after the last ends. */
function chain(pieces: readonly Piece[]): Segment[] {
  let end = 0;
  return pieces.map(({ gap, length, factor }) => {
    const start = end + gap;
    end = start + length;
    return { start: us(start), end: us(end), factor };
  });
}

describe('slowdownSegments', () => {
  it('accepts sorted segments that do not overlap, touching allowed, and none at all', () => {
    const segments = [seg(1, 2, 2), seg(2, 3, 4), seg(5, 6, 1.5)];
    expect(slowdownSegments(segments)).toEqual({ segments });
    expect(slowdownSegments([])).toEqual({ segments: [] });
  });

  it('refuses a bad factor, a backward segment, and segments out of order or overlapping', () => {
    expect(() => slowdownSegments([seg(1, 2, 0.5)])).toThrow(
      'factor must be from 1 to 16, got 0.5',
    );
    expect(() => slowdownSegments([seg(1, 2, 2), seg(3, 4, 17)])).toThrow(RangeError);
    expect(() => slowdownSegments([seg(2, 1, 2)])).toThrow(
      'range must end after it starts, got 2000000 to 1000000',
    );
    expect(() => slowdownSegments([seg(3, 4, 2), seg(1, 2, 2)])).toThrow(
      'segments must be sorted and not overlap, got one at 1000000 after one ending at 4000000',
    );
    expect(() => slowdownSegments([seg(1, 3, 2), seg(2, 4, 2)])).toThrow(RangeError);
  });
});

describe('outputTime', () => {
  it('stretches each segment by its own factor and keeps the pace between them', () => {
    const two = slowdownSegments([seg(1, 2, 2), seg(3, 4, 4)]);
    const at = (time: number): number => outputTime(us(time * 1e6), two) / 1e6;
    expect([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map((time) => at(time))).toEqual([
      0.5, 1, 2, 3, 3.5, 4, 6, 8, 9,
    ]);
    const touching = slowdownSegments([seg(1, 2, 2), seg(2, 3, 3)]);
    expect(outputTime(us(2_500_000), touching)).toBe(4_500_000);
    expect(outputTime(us(4_000_000), touching)).toBe(7_000_000);
    expect(outputTime(us(7), slowdownSegments([]))).toBe(7);
  });

  it('maps output time back to the source across segments', () => {
    const two = slowdownSegments([seg(1, 2, 2), seg(3, 4, 4)]);
    const back = (time: number): number => sourceTimeAt(us(time * 1e6), two) / 1e6;
    expect([0.5, 2, 3, 3.5, 4, 6, 8, 9].map((time) => back(time))).toEqual([
      0.5, 1.5, 2, 2.5, 3, 3.5, 4, 5,
    ]);
  });

  it('stretches every time by the factor when there is no range', () => {
    expect(outputTime(us(40_000), slowdown(2))).toBe(80_000);
    expect(outputTime(us(0), slowdown(4))).toBe(0);
  });

  it('stretches only the range and shifts what follows it', () => {
    const half = slowdown(2, range);
    expect(outputTime(us(500_000), half)).toBe(500_000);
    expect(outputTime(us(1_000_000), half)).toBe(1_000_000);
    expect(outputTime(us(1_500_000), half)).toBe(2_000_000);
    expect(outputTime(us(2_000_000), half)).toBe(3_000_000);
    expect(outputTime(us(2_500_000), half)).toBe(3_500_000);
  });

  it('keeps the order of times and is undone by sourceTimeAt', () => {
    const factors = fc.double({ min: 1, max: 16, noNaN: true });
    const times = fc.tuple(
      fc.integer({ min: -1e9, max: 1e10 }),
      fc.integer({ min: -1e9, max: 1e10 }),
    );
    fc.assert(
      fc.property(factors, fc.boolean(), times, (factor, isRanged, [a, b]) => {
        const s = slowdown(factor, isRanged ? range : undefined);
        const [early, late] = a < b ? [a, b] : [b, a];
        const [outEarly, outLate] = [outputTime(us(early), s), outputTime(us(late), s)];
        if (early < late) expect(outEarly).toBeLessThan(outLate);
        const back = sourceTimeAt(outputTime(us(a), s), s);
        expect(back).toBeCloseTo(a, 3);
      }),
    );
  });

  it('keeps order and is undone by sourceTimeAt for any segments', () => {
    const pieces = fc.array(
      fc.record({
        gap: fc.integer({ min: 0, max: 1e7 }),
        length: fc.integer({ min: 1, max: 1e7 }),
        factor: fc.double({ min: 1, max: 16, noNaN: true }),
      }),
      { maxLength: 5 },
    );
    const times = fc.tuple(fc.integer({ min: -1e9, max: 1e9 }), fc.integer({ min: 1, max: 1e8 }));
    fc.assert(
      fc.property(pieces, times, (parts, [a, step]) => {
        const s = slowdownSegments(chain(parts));
        const [early, late] = [outputTime(us(a), s), outputTime(us(a + step), s)];
        expect(early).toBeLessThan(late);
        const back = sourceTimeAt(early, s);
        expect(back).toBeCloseTo(a, 3);
      }),
    );
  });
});
