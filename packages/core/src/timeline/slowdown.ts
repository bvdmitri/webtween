import { microseconds, type Microseconds } from '../shared/units/units';

/** The span of source time a slowdown stretches, `start` before `end`. */
export interface TimeRange {
  readonly start: Microseconds;
  readonly end: Microseconds;
}

/** A span of source time and the factor it is slowed by: each of its seconds lasts `factor`. */
export interface Segment extends TimeRange {
  readonly factor: number;
}

/**
 * How a video is slowed: either every source second lasts `factor` seconds (the whole video), or
 * each source second inside a segment lasts that segment's `factor` and time between the segments
 * keeps its pace.
 *
 * @remarks Built by {@link slowdown} or {@link slowdownSegments}, which check it: segments are
 * sorted and do not overlap (they may touch). A factor need not be whole: 1.5 plays at two thirds
 * speed. No segments at all leaves time as it is.
 */
export type Slowdown = { readonly factor: number } | { readonly segments: readonly Segment[] };

const MAX_FACTOR = 16;

/** `value` held to 0..`limit`: how much of a span lies before a time. */
const clamp = (value: number, limit: number): number => Math.min(Math.max(value, 0), limit);

function checkFactor(factor: number): void {
  if (!(factor >= 1 && factor <= MAX_FACTOR)) {
    throw new RangeError(`factor must be from 1 to ${MAX_FACTOR}, got ${factor}`);
  }
}

function checkRange(range: TimeRange): void {
  if (!(range.end > range.start)) {
    throw new RangeError(`range must end after it starts, got ${range.start} to ${range.end}`);
  }
}

/**
 * A checked {@link Slowdown} of segments: each a factor from 1 to 16 over a range that runs
 * forward, in order, none starting before the one ahead of it ends.
 */
export function slowdownSegments(segments: readonly Segment[]): Slowdown {
  let previous: Segment | undefined;
  for (const segment of segments) {
    checkFactor(segment.factor);
    checkRange(segment);
    if (previous !== undefined && segment.start < previous.end) {
      throw new RangeError(
        `segments must be sorted and not overlap, got one at ${segment.start} after one ending at ${previous.end}`,
      );
    }
    previous = segment;
  }
  return { segments };
}

/**
 * A checked {@link Slowdown} by one factor from 1 to 16: over `range` (one segment) if given, the
 * whole video otherwise.
 */
export function slowdown(factor: number, range?: TimeRange): Slowdown {
  checkFactor(factor);
  return range === undefined
    ? { factor }
    : slowdownSegments([{ start: range.start, end: range.end, factor }]);
}

/**
 * Where a source time lands in the slowed video. Strictly increasing and continuous, so frames
 * keep their order and a frame's duration maps to the output by its two ends.
 */
export function outputTime(time: Microseconds, s: Slowdown): Microseconds {
  if ('factor' in s) return microseconds(time * s.factor);
  let shift = 0;
  for (const { start, end, factor } of s.segments) {
    shift += clamp(time - start, end - start) * (factor - 1);
  }
  return microseconds(time + shift);
}

/**
 * The source time an output time shows: the inverse of {@link outputTime}. A caller keeping its
 * own timeline in source time (a keyframed camera path) reads it at this time for each output
 * frame.
 */
export function sourceTimeAt(time: Microseconds, s: Slowdown): Microseconds {
  if ('factor' in s) return microseconds(time / s.factor);
  let shift = 0;
  let back = 0;
  for (const { start, end, factor } of s.segments) {
    const length = end - start;
    back += (clamp(time - (start + shift), length * factor) * (factor - 1)) / factor;
    shift += length * (factor - 1);
  }
  return microseconds(time - back);
}
