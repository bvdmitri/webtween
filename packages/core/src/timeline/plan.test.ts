import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { microseconds, type Microseconds } from '../shared/units/units';
import { planLast, planPair } from './plan';
import { outputTime, slowdown } from './slowdown';

const us = (value: number): Microseconds => microseconds(value);
const FRAME = 33_333;

describe('planPair', () => {
  it('puts factor minus one frames evenly between two frames', () => {
    const plan = planPair(us(0), us(FRAME), slowdown(4));
    expect(plan.first).toEqual({ timestamp: 0, duration: 33_333 });
    expect(plan.tweens).toEqual([
      { t: 0.25, timestamp: 33_333, duration: 33_333 },
      { t: 0.5, timestamp: 66_666, duration: 33_333 },
      { t: 0.75, timestamp: 99_999, duration: 33_333 },
    ]);
  });

  it('adds nothing outside the range or at factor 1', () => {
    const outside = slowdown(2, { start: us(1_000_000), end: us(2_000_000) });
    expect(planPair(us(0), us(FRAME), outside)).toEqual({
      first: { timestamp: 0, duration: FRAME },
      tweens: [],
    });
    expect(planPair(us(0), us(FRAME), slowdown(1)).tweens).toEqual([]);
  });

  it('places a pair that straddles the range edge by where its output falls', () => {
    const s = slowdown(2, { start: us(10_000), end: us(1_000_000) });
    const plan = planPair(us(0), us(20_000), s);
    // 10 ms before the range, 10 ms inside it stretched to 20 ms: 30 ms of output, one tween.
    expect(plan.tweens).toHaveLength(1);
    expect(plan.tweens[0]?.timestamp).toBe(15_000);
    expect(plan.tweens[0]?.t).toBeCloseTo(0.625, 9);
  });

  it('refuses a pair that does not run forward', () => {
    expect(() => planPair(us(10), us(10), slowdown(2))).toThrow(
      'frames must run forward, got 10 then 10',
    );
  });

  it('tiles the pair: increasing timestamps, no gaps, t inside the pair', () => {
    const lengths = fc.integer({ min: 1, max: 1e7 });
    const ranges = fc.record({ from: fc.nat(1e7), length: lengths });
    const arbitrary = fc.record({
      factor: fc.double({ min: 1, max: 16, noNaN: true }),
      start: fc.integer({ min: 0, max: 1e7 }),
      gap: fc.integer({ min: 1000, max: 1e6 }),
      ranged: fc.option(ranges),
    });
    fc.assert(
      fc.property(arbitrary, ({ factor, start, gap, ranged }) => {
        const r =
          ranged === null
            ? undefined
            : { start: us(ranged.from), end: us(ranged.from + ranged.length) };
        const s = slowdown(factor, r);
        const plan = planPair(us(start), us(start + gap), s);
        const frames = [plan.first, ...plan.tweens];
        for (const [index, frame] of frames.entries()) {
          const next = frames[index + 1]?.timestamp ?? Math.round(outputTime(us(start + gap), s));
          expect(frame.timestamp + frame.duration).toBe(next);
          expect(frame.duration).toBeGreaterThan(0);
        }
        const ts = plan.tweens.map((tween) => tween.t);
        expect(ts).toEqual(ts.toSorted((a, b) => a - b));
        for (const t of ts) expect(t > 0 && t < 1).toBe(true);
      }),
    );
  });
});

describe('planLast', () => {
  it('stretches the last frame by the factor where it falls', () => {
    expect(planLast(us(FRAME), us(FRAME), slowdown(2))).toEqual({
      timestamp: 66_666,
      duration: 66_666,
    });
    const outside = slowdown(2, { start: us(0), end: us(10) });
    expect(planLast(us(FRAME), us(FRAME), outside)).toEqual({
      timestamp: 33_343,
      duration: 33_333,
    });
  });
});
