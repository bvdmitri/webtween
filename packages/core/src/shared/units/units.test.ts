import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  microseconds,
  microsecondsToSeconds,
  seconds,
  secondsToMicroseconds,
  type Seconds,
} from './units';

describe('units', () => {
  it('converts times both ways', () => {
    expect(microsecondsToSeconds(microseconds(1_500_000))).toBe(1.5);
    expect(secondsToMicroseconds(seconds(0.033367))).toBe(33_367);
  });

  it('round-trips whole microseconds exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }), (value) => {
        const back = secondsToMicroseconds(microsecondsToSeconds(microseconds(value)));
        expect(back).toBe(value);
      }),
    );
  });

  it('refuses a value that is not a finite number', () => {
    expect(() => seconds(Infinity)).toThrow('seconds must be finite, got Infinity');
    expect(() => microseconds(NaN)).toThrow('microseconds must be finite, got NaN');
  });

  it('keeps units apart at compile time', () => {
    expectTypeOf(seconds(1)).not.toEqualTypeOf<number>();
    // @ts-expect-error a plain number is not a duration
    const unbranded: Seconds = 1;
    expect(unbranded).toBe(1);
  });
});
