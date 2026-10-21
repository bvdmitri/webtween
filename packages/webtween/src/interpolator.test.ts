import { readFileSync } from 'node:fs';

import * as ort from 'onnxruntime-web';
import { describe, expect, it, vi } from 'vitest';

import { WebtweenError } from './errors';
import { createInterpolator } from './interpolator';
import type { Platform } from './platform';
import type { FakeFrame } from './testing/frames';
import { fakeFrames, grey } from './testing/frames';

const blend = new Uint8Array(
  readFileSync(new URL('../../../test/fixtures/model/blend.onnx', import.meta.url)),
);
const SIZE = { width: 3, height: 2 };

function platform(overrides: Partial<Platform> = {}): Platform {
  return {
    frames: fakeFrames,
    importRuntime: () => Promise.resolve(ort),
    hasWebGpu: () => Promise.resolve(false),
    fetch: () => Promise.resolve(blend),
    ...overrides,
  };
}

describe('createInterpolator on WASM', () => {
  it('generates the frame at t between two frames, timestamped between them', async () => {
    const interpolator = await createInterpolator({ model: blend, ...SIZE, platform: platform() });
    expect(interpolator).toMatchObject({ backend: 'wasm', width: 3, height: 2 });
    const out = (await interpolator.between(
      grey(0, SIZE, 0),
      grey(200, SIZE, 1000),
      0.25,
    )) as unknown as FakeFrame;
    expect([...out.rgba.slice(0, 8)]).toEqual([50, 50, 50, 255, 50, 50, 50, 255]);
    expect(out.timestamp).toBe(250);
    await interpolator.destroy();
  });

  it('reads a pair once for several times between it', async () => {
    const pixels = vi.fn((frame: VideoFrame) => fakeFrames.pixels(frame));
    const frames = { ...fakeFrames, pixels };
    const interpolator = await createInterpolator({
      model: blend,
      ...SIZE,
      platform: platform({ frames }),
    });
    const [a, b] = [grey(0, SIZE), grey(100, SIZE)];
    await interpolator.between(a, b, 0.25);
    await interpolator.between(a, b, 0.75);
    expect(pixels).toHaveBeenCalledTimes(2);
    await interpolator.between(b, a, 0.5);
    expect(pixels).toHaveBeenCalledTimes(4);
  });

  it('fetches a model given by URL, and only then loads the runtime', async () => {
    const order: string[] = [];
    const interpolator = await createInterpolator({
      model: new URL('https://example.test/rife.onnx'),
      ...SIZE,
      backend: 'wasm',
      wasmPaths: '/ort/',
      platform: platform({
        fetch: (url) => {
          order.push(`fetch ${url}`);
          return Promise.resolve(blend);
        },
        importRuntime: () => {
          order.push('runtime');
          return Promise.resolve(ort);
        },
        hasWebGpu: () => Promise.reject(new Error('a WASM interpolator does not ask for WebGPU')),
      }),
    });
    expect(order).toEqual(['fetch https://example.test/rife.onnx', 'runtime']);
    expect(ort.env.wasm.wasmPaths).toBe('/ort/');
    await interpolator.destroy();
  });

  it('takes the model as an ArrayBuffer', async () => {
    const interpolator = await createInterpolator({
      model: blend.slice().buffer,
      ...SIZE,
      platform: platform(),
    });
    expect(interpolator.backend).toBe('wasm');
  });

  it('refuses frames of another size and a t outside 0..1', async () => {
    const interpolator = await createInterpolator({ model: blend, ...SIZE, platform: platform() });
    const other = grey(0, { width: 4, height: 2 });
    await expect(interpolator.between(other, other, 0.5)).rejects.toThrow(
      'the interpolator takes 3x2 frames, got 4x2',
    );
    await expect(interpolator.between(grey(0, SIZE), grey(0, SIZE), 1.5)).rejects.toThrow(
      RangeError,
    );
  });
});

/** The code of the {@link WebtweenError} `promise` rejects with, or undefined if it resolves. */
async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof WebtweenError ? error.code : 'not a WebtweenError';
  }
}

describe('createInterpolator failures', () => {
  it('names a model it cannot fetch, a runtime it cannot load, and bytes that are no model', async () => {
    const unreachable = platform({ fetch: () => Promise.reject(new Error('404')) });
    expect(
      await code(createInterpolator({ model: 'm.onnx', ...SIZE, platform: unreachable })),
    ).toBe('model-unavailable');
    const noRuntime = platform({ importRuntime: () => Promise.reject(new Error('no wasm')) });
    expect(await code(createInterpolator({ model: blend, ...SIZE, platform: noRuntime }))).toBe(
      'runtime-unavailable',
    );
    const junk = new Uint8Array([1, 2, 3]);
    const plain = platform();
    expect(await code(createInterpolator({ model: junk, ...SIZE, platform: plain }))).toBe(
      'model-invalid',
    );
  });
});
