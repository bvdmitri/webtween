import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserFrames, browserPlatform } from './platform';

afterEach(() => {
  vi.unstubAllGlobals();
});

class StubFrame {
  public readonly args: unknown[];
  public constructor(...values: unknown[]) {
    this.args = values;
  }
}

describe('browserFrames', () => {
  const copyTo = vi.fn((target: Uint8ClampedArray) => {
    target.fill(7);
    return Promise.resolve([]);
  });
  const fields = {
    codedWidth: 8,
    codedHeight: 6,
    visibleRect: { width: 4, height: 2 },
    timestamp: 500,
    duration: null,
    copyTo,
  };
  const decoded = fields as unknown as VideoFrame;

  it('reads the visible size, the timing and the visible pixels as RGBA', async () => {
    expect(browserFrames.size(decoded)).toEqual({ width: 4, height: 2 });
    expect(browserFrames.size({ ...fields, visibleRect: null } as unknown as VideoFrame)).toEqual({
      width: 8,
      height: 6,
    });
    expect(browserFrames.timing(decoded)).toEqual({ timestamp: 500, duration: 0 });
    const pixels = await browserFrames.pixels(decoded);
    expect(pixels).toHaveLength(32);
    expect(copyTo).toHaveBeenCalledWith(pixels, { format: 'RGBA' });
  });

  it('makes RGBA frames and retimed copies with VideoFrame', () => {
    vi.stubGlobal('VideoFrame', StubFrame);
    const rgba = new Uint8ClampedArray(4);
    const made = browserFrames.make(
      rgba,
      { width: 1, height: 1 },
      9 as never,
    ) as unknown as StubFrame;
    expect(made.args).toEqual([
      rgba,
      { format: 'RGBA', codedWidth: 1, codedHeight: 1, timestamp: 9 },
    ]);
    const timing = { timestamp: 1, duration: 2 } as never;
    const copy = browserFrames.retime(decoded, timing) as unknown as StubFrame;
    expect(copy.args).toEqual([decoded, timing]);
  });
});

describe('browserPlatform', () => {
  it('fetches a model and refuses a failed response', async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('missing')
          ? { ok: false, status: 404 }
          : {
              ok: true,
              arrayBuffer: (): Promise<ArrayBuffer> =>
                Promise.resolve(new Uint8Array([1, 2]).buffer),
            },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    expect([...(await browserPlatform().fetch('m.onnx'))]).toEqual([1, 2]);
    await expect(browserPlatform().fetch('missing')).rejects.toThrow('fetching missing gave 404');
  });

  it('has WebGPU only where the browser has an adapter', async () => {
    vi.stubGlobal('navigator', {});
    expect(await browserPlatform().hasWebGpu()).toBe(false);
    vi.stubGlobal('navigator', { gpu: { requestAdapter: () => Promise.resolve(null) } });
    expect(await browserPlatform().hasWebGpu()).toBe(false);
    vi.stubGlobal('navigator', { gpu: { requestAdapter: () => Promise.resolve({}) } });
    expect(await browserPlatform().hasWebGpu()).toBe(true);
  });

  it('imports onnxruntime-web only when asked', async () => {
    const runtime = await browserPlatform().importRuntime();
    expect(runtime.InferenceSession).toBeDefined();
  });
});
