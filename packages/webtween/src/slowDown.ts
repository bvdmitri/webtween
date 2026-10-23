import {
  microseconds,
  outputTime,
  secondsToMicroseconds,
  seconds,
  slowdown,
  slowdownSegments,
  slowStream,
  sourceTimeAt,
  microsecondsToSeconds,
  type Microseconds,
  type Slowdown,
  type Tweener,
} from '@webtween/core';

import type { Interpolator } from './interpolator';
import { browserFrames, type FrameOps } from './platform';

/** A span of the source, in seconds, slowed by its own `factor` from 1 to 16. */
export interface SlowdownSegment {
  readonly start: number;
  readonly end: number;
  readonly factor: number;
}

/**
 * How much to slow down, and where. Either one `factor` from 1 to 16 (2 is half speed) over
 * `range`, in seconds of the source, or the whole video when `range` is absent; or `segments`,
 * each a span of the source in seconds with its own factor, the source between them at its pace.
 *
 * @remarks Segments are sorted and do not overlap; one may start where the one before it ends.
 * An empty list slows nothing. Invalid input throws a `RangeError`, as does giving both a factor
 * and segments.
 */
export type SlowdownOptions =
  | {
      readonly factor: number;
      readonly range?: { readonly start: number; readonly end: number };
      readonly segments?: never;
    }
  | {
      readonly segments: readonly SlowdownSegment[];
      readonly factor?: never;
      readonly range?: never;
    };

/** A slowdown and what to slow it with, as {@link slowDown} takes them. */
export type SlowDownOptions = SlowdownOptions & {
  readonly interpolator: Interpolator;
  readonly signal?: AbortSignal;
  /** Called after each source frame is done, with how many are done. */
  readonly onProgress?: (framesDone: number) => void;
  readonly frames?: FrameOps;
};

const us = (time: number): Microseconds => secondsToMicroseconds(seconds(time));

function checked(options: SlowdownOptions): Slowdown {
  const { segments } = options;
  if (segments === undefined) {
    const { factor, range } = options;
    return range === undefined
      ? slowdown(factor)
      : slowdown(factor, { start: us(range.start), end: us(range.end) });
  }
  // The types forbid both, but a caller without them can still pass both.
  const given: { readonly factor?: unknown; readonly range?: unknown } = options;
  if (given.factor !== undefined || given.range !== undefined) {
    throw new RangeError('give either factor (with an optional range) or segments, not both');
  }
  return slowdownSegments(
    segments.map((segment) => ({
      start: us(segment.start),
      end: us(segment.end),
      factor: segment.factor,
    })),
  );
}

/**
 * The time map of a slowdown, in seconds: where a source time lands in the slowed video, and
 * which source time an output time shows. Both are rounded to whole microseconds, so `output` of a
 * source frame's time is exactly the timestamp {@link slowDown} gives that frame. Piecewise
 * linear: each segment stretched by its factor, the time between segments shifted. A caller keeping
 * its own timeline in source time (a keyframed camera path, a caption) reads it through `source`.
 */
export function slowdownTimeline(options: SlowdownOptions): {
  output(sourceSeconds: number): number;
  source(outputSeconds: number): number;
} {
  const s = checked(options);
  const through =
    (map: typeof outputTime) =>
    (time: number): number => {
      const at = us(time);
      // Whole microseconds, as slowDown times its frames, so the two agree exactly.
      const whole = microseconds(Math.round(map(at, s)));
      return microsecondsToSeconds(whole);
    };
  return { output: through(outputTime), source: through(sourceTimeAt) };
}

function tweener(interpolator: Interpolator, frames: FrameOps): Tweener<VideoFrame> {
  return {
    timing: (frame) => frames.timing(frame),
    retime: (frame, timing) => frames.retime(frame, timing),
    between: async (a, b, tween): Promise<VideoFrame> => {
      const generated = await interpolator.between(a, b, tween.t);
      const timed = frames.retime(generated, tween);
      generated.close();
      return timed;
    },
    close: (frame): void => {
      frame.close();
    },
  };
}

async function* counted<F>(
  frames: AsyncIterable<F>,
  onProgress?: (done: number) => void,
): AsyncGenerator<F> {
  let done = 0;
  for await (const frame of frames) {
    yield frame;
    done += 1;
    onProgress?.(done);
  }
}

/**
 * Slow a stream of decoded frames down: each frame retimed, and frames generated between
 * consecutive frames where the slowdown stretches time.
 *
 * @remarks Streams: at most two source frames are held, and each is closed once used, also when
 * the consumer stops early or `signal` aborts (which throws its reason). The caller closes every
 * frame it receives. Frames must be the interpolator's size.
 */
export function slowDown(
  frames: AsyncIterable<VideoFrame>,
  options: SlowDownOptions,
): AsyncGenerator<VideoFrame, void, undefined> {
  const ops = options.frames ?? browserFrames;
  const stream = { slowdown: checked(options), ...(options.signal && { signal: options.signal }) };
  return slowStream(
    counted(frames, options.onProgress),
    tweener(options.interpolator, ops),
    stream,
  );
}
