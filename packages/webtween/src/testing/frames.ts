// Stand-in video frames for tests outside a browser: RGBA pixels, a timing, and a closed flag.
import { microseconds, type Size, type Timing } from '@webtween/core';

import type { FrameOps } from '../platform';

/** A test frame: what `FrameOps` reads from a `VideoFrame`, held as plain values. */
export class FakeFrame {
  public closed = false;
  public readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  public readonly size: Size;
  public readonly timestamp: number;
  public readonly duration: number;

  public constructor(rgba: Uint8ClampedArray<ArrayBuffer>, size: Size, timing: Timing) {
    this.rgba = rgba;
    this.size = size;
    this.timestamp = timing.timestamp;
    this.duration = timing.duration;
  }

  public close(): void {
    this.closed = true;
  }
}

const RGBA = 4;
const ALPHA = 3;
const OPAQUE = 255;
const FRAME_DURATION = 1000;

/** A frame of one grey level, as a `VideoFrame` for the code under test. */
export function grey(level: number, size: Size, timestamp = 0): VideoFrame {
  const rgba = new Uint8ClampedArray(size.width * size.height * RGBA).fill(level);
  for (let alpha = ALPHA; alpha < rgba.length; alpha += RGBA) rgba[alpha] = OPAQUE;
  const timing = { timestamp: microseconds(timestamp), duration: microseconds(FRAME_DURATION) };
  return new FakeFrame(rgba, size, timing) as unknown as VideoFrame;
}

const fake = (frame: VideoFrame): FakeFrame => frame as unknown as FakeFrame;

/** `FrameOps` over {@link FakeFrame}s. */
export const fakeFrames: FrameOps = {
  size: (frame) => fake(frame).size,
  timing: (frame) => ({
    timestamp: microseconds(frame.timestamp),
    duration: microseconds(frame.duration ?? 0),
  }),
  pixels: (frame) => Promise.resolve(new Uint8ClampedArray(fake(frame).rgba)),
  make: (rgba, size, timestamp) =>
    new FakeFrame(rgba, size, { timestamp, duration: microseconds(0) }) as unknown as VideoFrame,
  retime: (frame, timing) =>
    new FakeFrame(fake(frame).rgba, fake(frame).size, timing) as unknown as VideoFrame,
};
