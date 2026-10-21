import { describe, expect, it } from 'vitest';

import { microseconds } from '../shared/units/units';
import type { Timing, Tween } from './plan';
import { slowdown } from './slowdown';
import { slowStream, type Tweener } from './stream';

interface Frame {
  readonly name: string;
  readonly timestamp: number;
  readonly duration: number;
}

function harness(): { tweener: Tweener<Frame>; closed: string[]; calls: string[] } {
  const closed: string[] = [];
  const calls: string[] = [];
  const tweener: Tweener<Frame> = {
    timing: (f) => ({ timestamp: microseconds(f.timestamp), duration: microseconds(f.duration) }),
    retime: (f, timing: Timing) => ({ name: f.name, ...timing }),
    between: (a, b, tween: Tween) => {
      calls.push(`${a.name}${b.name}@${tween.t}`);
      return Promise.resolve({ name: `${a.name}${b.name}`, ...tween });
    },
    close: (f) => {
      closed.push(f.name);
    },
  };
  return { tweener, closed, calls };
}

async function* source(...names: string[]): AsyncGenerator<Frame> {
  for (const [index, name] of names.entries()) {
    await Promise.resolve();
    yield { name, timestamp: index * 1000, duration: 1000 };
  }
}

async function collect(frames: AsyncIterable<Frame>): Promise<Frame[]> {
  const out: Frame[] = [];
  for await (const frame of frames) out.push(frame);
  return out;
}

describe('slowStream', () => {
  it('yields each source frame retimed with the generated frames between them', async () => {
    const { tweener, closed, calls } = harness();
    const out = await collect(
      slowStream(source('a', 'b', 'c'), tweener, { slowdown: slowdown(2) }),
    );
    expect(out.map((f) => [f.name, f.timestamp, f.duration])).toEqual([
      ['a', 0, 1000],
      ['ab', 1000, 1000],
      ['b', 2000, 1000],
      ['bc', 3000, 1000],
      ['c', 4000, 2000],
    ]);
    expect(calls).toEqual(['ab@0.5', 'bc@0.5']);
    expect(closed).toEqual(['a', 'b', 'c']);
  });

  it('passes a single frame through retimed, and nothing for no frames', async () => {
    const { tweener, closed } = harness();
    const options = { slowdown: slowdown(3) };
    const one = await collect(slowStream(source('a'), tweener, options));
    expect(one).toEqual([{ name: 'a', timestamp: 0, duration: 3000 }]);
    expect(closed).toEqual(['a']);
    const none = await collect(slowStream(source(), tweener, options));
    expect(none).toEqual([]);
  });

  it('stops with the signal reason and closes the frame it holds', async () => {
    const { tweener, closed } = harness();
    const controller = new AbortController();
    const frames = slowStream(source('a', 'b', 'c'), tweener, {
      slowdown: slowdown(2),
      signal: controller.signal,
    });
    await frames.next();
    controller.abort(new Error('stopped'));
    await expect(frames.next()).rejects.toThrow('stopped');
    expect(closed).toEqual(['a', 'b']);
  });

  it('closes the frame it holds when the consumer stops early', async () => {
    const { tweener, closed } = harness();
    const frames = slowStream(source('a', 'b', 'c'), tweener, { slowdown: slowdown(2) });
    for await (const frame of frames) {
      if (frame.name === 'ab') break;
    }
    expect(closed).toEqual(['a', 'b']);
  });
});
