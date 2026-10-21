import { planLast, planPair, type Timing, type Tween } from './plan';
import type { Slowdown } from './slowdown';

/**
 * What a slowdown needs from a frame type: its timing, a retimed copy, a frame generated between
 * two, and a way to release one. The browser binds it to `VideoFrame`; tests bind it to plain
 * values.
 *
 * @remarks `retime` and `between` return frames the stream's consumer owns; `close` releases a
 * source frame once the stream is done with it.
 */
export interface Tweener<F> {
  timing(frame: F): Timing;
  retime(frame: F, timing: Timing): F;
  between(a: F, b: F, tween: Tween): Promise<F>;
  close(frame: F): void;
}

/** The part of an `AbortSignal` the stream reads, so the core needs no DOM types. */
export interface StopSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
}

/** A slowdown and, optionally, a signal that stops it between frames. */
export interface StreamOptions {
  readonly slowdown: Slowdown;
  readonly signal?: StopSignal;
}

function checkSignal(signal: StopSignal | undefined): void {
  if (signal?.aborted === true) throw signal.reason;
}

async function* pairFrames<F>(
  [a, b]: readonly [F, F],
  tweener: Tweener<F>,
  options: StreamOptions,
): AsyncGenerator<F, void, undefined> {
  const plan = planPair(tweener.timing(a).timestamp, tweener.timing(b).timestamp, options.slowdown);
  yield tweener.retime(a, plan.first);
  for (const tween of plan.tweens) {
    checkSignal(options.signal);
    yield await tweener.between(a, b, tween);
  }
}

/**
 * Slow a stream of frames down: each source frame retimed, with frames generated between
 * consecutive ones where the slowdown stretches time.
 *
 * @remarks Holds at most two source frames, and closes every source frame once it is used, also
 * when the consumer stops early or the signal aborts (which throws the signal's reason).
 */
export async function* slowStream<F>(
  frames: AsyncIterable<F>,
  tweener: Tweener<F>,
  options: StreamOptions,
): AsyncGenerator<F, void, undefined> {
  let previous: F | undefined;
  try {
    for await (const frame of frames) {
      const held = previous;
      previous = frame;
      if (held === undefined) continue;
      try {
        yield* pairFrames([held, frame], tweener, options);
      } finally {
        tweener.close(held);
      }
    }
    if (previous !== undefined) {
      const { timestamp, duration } = tweener.timing(previous);
      yield tweener.retime(previous, planLast(timestamp, duration, options.slowdown));
    }
  } finally {
    if (previous !== undefined) tweener.close(previous);
  }
}
