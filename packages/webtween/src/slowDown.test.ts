import { describe, expect, it, vi } from 'vitest';

import type { Interpolator } from './interpolator';
import { slowDown, slowdownTimeline } from './slowDown';
import type { FakeFrame } from './testing/frames';
import { fakeFrames, grey } from './testing/frames';

const SIZE = { width: 2, height: 2 };

// An interpolator that returns a grey frame whose level is t, scaled to a byte.
const interpolator = {
  backend: 'wasm',
  ...SIZE,
  between: vi.fn((a: VideoFrame, b: VideoFrame, t: number) =>
    Promise.resolve(grey(Math.round(t * 100), SIZE, a.timestamp + t * (b.timestamp - a.timestamp))),
  ),
  destroy: (): Promise<void> => Promise.resolve(),
} satisfies Interpolator;

async function* frames(count: number): AsyncGenerator<VideoFrame> {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
    yield grey(200, SIZE, index * 1000);
  }
}

describe('slowDown', () => {
  it('retimes the frames and inserts generated ones, reporting progress', async () => {
    const progress: number[] = [];
    const out: FakeFrame[] = [];
    const stream = slowDown(frames(3), {
      interpolator,
      factor: 4,
      frames: fakeFrames,
      onProgress: (done) => {
        progress.push(done);
      },
    });
    for await (const frame of stream) out.push(frame as unknown as FakeFrame);
    expect(out.map((frame) => frame.timestamp)).toEqual([
      0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
    ]);
    expect(out.map((frame) => frame.rgba[0])).toEqual([200, 25, 50, 75, 200, 25, 50, 75, 200]);
    expect(out.at(-1)?.duration).toBe(4000);
    expect(progress).toEqual([1, 2, 3]);
  });

  it('slows only the range, given in seconds', async () => {
    const out: number[] = [];
    const range = { start: 0.001, end: 0.002 };
    const stream = slowDown(frames(4), { interpolator, factor: 2, range, frames: fakeFrames });
    for await (const frame of stream) out.push(frame.timestamp);
    expect(out).toEqual([0, 1000, 2000, 3000, 4000]);
  });

  it('closes the frames the interpolator made once retimed', async () => {
    const made: FakeFrame[] = [];
    const recording = {
      ...interpolator,
      between: async (a: VideoFrame, b: VideoFrame, t: number): Promise<VideoFrame> => {
        const frame = await interpolator.between(a, b, t);
        made.push(frame as unknown as FakeFrame);
        return frame;
      },
    };
    const stream = slowDown(frames(2), { interpolator: recording, factor: 2, frames: fakeFrames });
    for await (const frame of stream) frame.close();
    expect(made).toHaveLength(1);
    expect(made[0]?.closed).toBe(true);
  });

  it('stops when the signal aborts', async () => {
    const controller = new AbortController();
    const stream = slowDown(frames(3), {
      interpolator,
      factor: 2,
      frames: fakeFrames,
      signal: controller.signal,
    });
    await stream.next();
    controller.abort(new Error('cancelled'));
    await expect(stream.next()).rejects.toThrow('cancelled');
  });
});

describe('slowdownTimeline', () => {
  it('maps source seconds to output seconds and back', () => {
    const timeline = slowdownTimeline({ factor: 2, range: { start: 1, end: 2 } });
    expect(timeline.output(0.5)).toBe(0.5);
    expect(timeline.output(1.5)).toBe(2);
    expect(timeline.output(3)).toBe(4);
    expect(timeline.source(2)).toBe(1.5);
    expect(slowdownTimeline({ factor: 4 }).source(4)).toBe(1);
  });
});
