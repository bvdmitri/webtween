import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { microseconds, type Microseconds } from '../shared/units/units';
import { outputTime, slowdown, sourceTimeAt } from './slowdown';

const us = (value: number): Microseconds => microseconds(value);
const range = { start: us(1_000_000), end: us(2_000_000) };

describe('slowdown', () => {
  it('accepts a factor from 1 to 16 and a range that runs forward', () => {
    expect(slowdown(2)).toEqual({ factor: 2 });
    expect(slowdown(1.5, range)).toEqual({ factor: 1.5, range });
    expect(() => slowdown(0.5)).toThrow('factor must be from 1 to 16, got 0.5');
    expect(() => slowdown(17)).toThrow(RangeError);
    expect(() => slowdown(NaN)).toThrow(RangeError);
    expect(() => slowdown(2, { start: us(5), end: us(5) })).toThrow(
      'range must end after it starts, got 5 to 5',
    );
  });
});

describe('outputTime', () => {
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
});
