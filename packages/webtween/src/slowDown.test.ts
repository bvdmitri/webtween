import { describe, expect, it, vi } from 'vitest';

import type { Interpolator } from './interpolator';
import { slowDown, slowdownTimeline, type SlowDownOptions } from './slowDown';
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

function run(options: object): unknown {
  return slowDown(frames(1), {
    interpolator,
    frames: fakeFrames,
    ...options,
  } as unknown as SlowDownOptions);
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

  it('slows each segment by its own factor and keeps the pace between them', async () => {
    const out: FakeFrame[] = [];
    const segments = [
      { start: 0, end: 0.001, factor: 2 },
      { start: 0.002, end: 0.003, factor: 4 },
    ];
    const stream = slowDown(frames(5), { interpolator, segments, frames: fakeFrames });
    for await (const frame of stream) out.push(frame as unknown as FakeFrame);
    expect(out.map((frame) => frame.timestamp)).toEqual([
      0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
    ]);
    expect(out.map((frame) => frame.rgba[0])).toEqual([200, 50, 200, 200, 25, 50, 75, 200, 200]);
    expect(out.at(-1)?.duration).toBe(1000);
  });

  it('refuses segments out of order, a bad factor, and a factor beside segments', () => {
    const overlapping = [
      { start: 0, end: 2, factor: 2 },
      { start: 1, end: 3, factor: 2 },
    ];
    expect(() => run({ segments: overlapping })).toThrow(RangeError);
    expect(() => run({ segments: [{ start: 0, end: 1, factor: 20 }] })).toThrow(
      'factor must be from 1 to 16, got 20',
    );
    expect(() => run({ factor: 2, segments: [] })).toThrow(
      'give either factor (with an optional range) or segments, not both',
    );
    expect(() => slowdownTimeline({ factor: 2, segments: [] } as never)).toThrow(RangeError);
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

  it('maps across several segments, each by its own factor', () => {
    const timeline = slowdownTimeline({
      segments: [
        { start: 1, end: 2, factor: 2 },
        { start: 3, end: 4, factor: 4 },
      ],
    });
    expect([0.5, 1.5, 2.5, 3.5, 5].map((time) => timeline.output(time))).toEqual([
      0.5, 2, 3.5, 6, 9,
    ]);
    expect([0.5, 2, 3.5, 6, 9].map((time) => timeline.source(time))).toEqual([
      0.5, 1.5, 2.5, 3.5, 5,
    ]);
    expect(slowdownTimeline({ segments: [] }).output(3)).toBe(3);
  });
});

describe('slowdownTimeline and slowDown together', () => {
  it.each([
    { factor: 1.5, range: { start: 0.02, end: 0.07 } },
    {
      segments: [
        { start: 0.01, end: 0.04, factor: 1.5 },
        { start: 0.04, end: 0.05, factor: 3 },
        { start: 0.07, end: 0.09, factor: 2.5 },
      ],
    },
  ])('place each source frame at exactly the time the timeline gives it', async (options) => {
    const timeline = slowdownTimeline(options);
    const sourceTimes = [0, 33_333, 66_666, 99_999];
    async function* source(): AsyncGenerator<VideoFrame> {
      for (const time of sourceTimes) {
        await Promise.resolve();
        yield grey(200, SIZE, time);
      }
    }
    const emitted: number[] = [];
    const stream = slowDown(source(), { interpolator, ...options, frames: fakeFrames });
    for await (const frame of stream) {
      if ((frame as unknown as FakeFrame).rgba[0] === 200) emitted.push(frame.timestamp);
    }
    const placed = sourceTimes.map((time) => timeline.output(time / 1e6) * 1e6);
    expect(emitted).toEqual(placed.map((time) => Math.round(time)));
    for (const [k, time] of placed.entries()) expect(time).toBeCloseTo(emitted[k]!, 6);
  });
});
