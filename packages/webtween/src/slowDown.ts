import {
  outputTime,
  secondsToMicroseconds,
  seconds,
  slowdown,
  slowStream,
  sourceTimeAt,
  microsecondsToSeconds,
  type Slowdown,
  type Tweener,
} from '@webtween/core';

import type { Interpolator } from './interpolator';
import { browserFrames, type FrameOps } from './platform';

/**
 * How much to slow down, and where. `factor` from 1 to 16: 2 is half speed. `range`, in seconds
 * of the source, is the part slowed; the whole video when absent.
 */
export interface SlowdownOptions {
  readonly factor: number;
  readonly range?: { readonly start: number; readonly end: number };
}

/** A slowdown and what to slow it with, as {@link slowDown} takes them. */
export interface SlowDownOptions extends SlowdownOptions {
  readonly interpolator: Interpolator;
  readonly signal?: AbortSignal;
  /** Called after each source frame is done, with how many are done. */
  readonly onProgress?: (framesDone: number) => void;
  readonly frames?: FrameOps;
}

function checked(options: SlowdownOptions): Slowdown {
  const { factor, range } = options;
  if (range === undefined) return slowdown(factor);
  const start = secondsToMicroseconds(seconds(range.start));
  return slowdown(factor, { start, end: secondsToMicroseconds(seconds(range.end)) });
}

/**
 * The time map of a slowdown, in seconds: where a source time lands in the slowed video, and
 * which source time an output time shows. A caller keeping its own timeline in source time (a
 * keyframed camera path, a caption) reads it through `source`.
 */
export function slowdownTimeline(options: SlowdownOptions): {
  output(sourceSeconds: number): number;
  source(outputSeconds: number): number;
} {
  const s = checked(options);
  const through =
    (map: typeof outputTime) =>
    (time: number): number => {
      const at = secondsToMicroseconds(seconds(time));
      return microsecondsToSeconds(map(at, s));
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
