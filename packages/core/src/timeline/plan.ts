import { microseconds, type Microseconds } from '../shared/units/units';
import { outputTime, sourceTimeAt, type Slowdown } from './slowdown';

/** When an output frame shows and for how long, in whole microseconds as WebCodecs keeps them. */
export interface Timing {
  readonly timestamp: Microseconds;
  readonly duration: Microseconds;
}

/** A frame to generate between two source frames: `t` from 0 (the first) to 1 (the second). */
export interface Tween extends Timing {
  readonly t: number;
}

/**
 * The output for one pair of consecutive source frames: the first frame retimed, then the frames
 * generated between the two. The second frame belongs to the next pair, or to {@link planLast}.
 *
 * @remarks Output frames tile the pair's output span with no gap: each ends where the next starts.
 */
export interface PairPlan {
  readonly first: Timing;
  readonly tweens: readonly Tween[];
}

const whole = (time: number): Microseconds => microseconds(Math.round(time));

function timings(starts: readonly number[], end: number): Timing[] {
  return starts.map((start, index) => {
    const timestamp = whole(start);
    const next = whole(starts[index + 1] ?? end);
    return { timestamp, duration: microseconds(next - timestamp) };
  });
}

/**
 * Plan the frames from source frame `a` up to source frame `b`.
 *
 * @remarks The pair's output span holds as many frames as the source spacing fits, evenly spaced
 * in output time; each generated frame's `t` is the source time it shows. Inside a range with a
 * whole factor that is `factor - 1` frames at `t = k / factor`; outside it, none.
 */
export function planPair(a: Microseconds, b: Microseconds, s: Slowdown): PairPlan {
  if (b <= a) throw new RangeError(`frames must run forward, got ${a} then ${b}`);
  const from = outputTime(a, s);
  const to = outputTime(b, s);
  const count = Math.max(1, Math.round((to - from) / (b - a)));
  const step = (to - from) / count;
  const starts = [...Array.from({ length: count }).keys()].map((k) => from + k * step);
  const [first, ...rest] = timings(starts, to);
  const tweens = rest.map((timing, index) => {
    const source = sourceTimeAt(microseconds(starts[index + 1] ?? to), s);
    return { t: (source - a) / (b - a), ...timing };
  });
  return { first: first ?? { timestamp: whole(from), duration: whole(to - from) }, tweens };
}

/** The timing of the last source frame, which has no successor to pair with. */
export function planLast(time: Microseconds, duration: Microseconds, s: Slowdown): Timing {
  const timestamp = whole(outputTime(time, s));
  const end = whole(outputTime(microseconds(time + duration), s));
  return { timestamp, duration: microseconds(end - timestamp) };
}
