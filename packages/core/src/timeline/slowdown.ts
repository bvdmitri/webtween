import { microseconds, type Microseconds } from '../shared/units/units';

/** The span of source time a slowdown stretches, `start` before `end`. */
export interface TimeRange {
  readonly start: Microseconds;
  readonly end: Microseconds;
}

/**
 * How a video is slowed: every source second inside `range` (the whole video when it is absent)
 * lasts `factor` seconds in the output; time outside the range keeps its pace.
 *
 * @remarks Built by {@link slowdown}, which checks it. A factor need not be whole: 1.5 plays at
 * two thirds speed.
 */
export interface Slowdown {
  readonly factor: number;
  readonly range?: TimeRange;
}

const MAX_FACTOR = 16;

/** `value` held to 0..`limit`: how much of a range lies before a time. */
const clamp = (value: number, limit: number): number => Math.min(Math.max(value, 0), limit);

/** A checked {@link Slowdown}: a factor from 1 to 16 and, if given, a range that runs forward. */
export function slowdown(factor: number, range?: TimeRange): Slowdown {
  if (!(factor >= 1 && factor <= MAX_FACTOR)) {
    throw new RangeError(`factor must be from 1 to ${MAX_FACTOR}, got ${factor}`);
  }
  if (range === undefined) return { factor };
  if (range.end <= range.start) {
    throw new RangeError(`range must end after it starts, got ${range.start} to ${range.end}`);
  }
  return { factor, range };
}

/**
 * Where a source time lands in the slowed video. Strictly increasing and continuous, so frames
 * keep their order and a frame's duration maps to the output by its two ends.
 */
export function outputTime(time: Microseconds, s: Slowdown): Microseconds {
  const { factor, range } = s;
  if (range === undefined) return microseconds(time * factor);
  const inside = clamp(time - range.start, range.end - range.start);
  return microseconds(time + inside * (factor - 1));
}

/**
 * The source time an output time shows: the inverse of {@link outputTime}. A caller keeping its
 * own timeline in source time (a keyframed camera path) reads it at this time for each output
 * frame.
 */
export function sourceTimeAt(time: Microseconds, s: Slowdown): Microseconds {
  const { factor, range } = s;
  if (range === undefined) return microseconds(time / factor);
  const inside = clamp(time - range.start, (range.end - range.start) * factor);
  return microseconds(time - (inside * (factor - 1)) / factor);
}
