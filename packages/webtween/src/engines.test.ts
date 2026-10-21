import { paddedSize } from '@webtween/core';
import type { ModelFrames, ModelSession, Ort } from '@webtween/onnx';
import { create, globals } from 'webgpu';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { gpuEngine } from './engines';
import { createInterpolator } from './interpolator';
import type { FakeFrame } from './testing/frames';
import { fakeFrames, grey } from './testing/frames';

Object.assign(globalThis, globals);

// The GPU object is kept for the whole run: the native bindings must outlive their adapter.
const gpu = create([]);
// Opened in a hook: requesting the adapter while the module loads crashes the native bindings.
const opened: GPUDevice[] = [];
const device = (): GPUDevice => opened[0]!;
beforeAll(async () => {
  const adapter = await gpu.requestAdapter();
  if (adapter === null) throw new Error('no WebGPU adapter: the GPU engine tests need one');
  opened.push(await adapter.requestDevice());
});

afterAll(() => {
  device().destroy();
});

const SIZE = { width: 5, height: 3 };
const SIZES = { size: SIZE, padded: paddedSize(SIZE) };

// A model that shows the nearer frame: its output is one of its own input buffers.
const nearest = vi.fn((frames: ModelFrames<GPUBuffer>) =>
  Promise.resolve({ buffer: frames.t < 0.5 ? frames.img0 : frames.img1, dispose: vi.fn() }),
);
const session = { backend: 'webgpu', runOnGpu: nearest } as unknown as ModelSession;

describe('the GPU engine', () => {
  it('packs both frames, runs the model on the GPU and reads the frame back', async () => {
    const engine = gpuEngine({ session, device: device() }, SIZES, fakeFrames);
    const pair = [grey(10, SIZE), grey(240, SIZE)] as const;
    const early = await engine.generate(pair, 0.25);
    const late = await engine.generate(pair, 0.75);
    expect([...early.slice(0, 4)]).toEqual([10, 10, 10, 255]);
    expect([...late.slice(-4)]).toEqual([240, 240, 240, 255]);
    expect(late).toHaveLength(SIZE.width * SIZE.height * 4);
    expect(nearest.mock.calls[0]?.[0]).toMatchObject({ t: 0.25, size: SIZES.padded });
    engine.destroy();
  });
});

/** A stand-in for onnxruntime-web's tensor: keeps what it was built from. */
class StandInTensor {
  public readonly type: string;
  public readonly data: Float32Array;

  public constructor(type: string, data: Float32Array) {
    this.type = type;
    this.data = data;
  }
}

describe('createInterpolator on WebGPU', () => {
  it('runs the shaders on the device the runtime opened the model on', async () => {
    const output = { dispose: vi.fn() };
    const fakeOrt = {
      env: { wasm: {}, webgpu: { device: Promise.resolve(device()) } },
      InferenceSession: {
        create: () =>
          Promise.resolve({
            inputNames: ['img0', 'img1', 'timestep'],
            outputNames: ['output'],
            run: (feeds: Record<string, { buffer: GPUBuffer }>) =>
              Promise.resolve({ output: { ...output, gpuBuffer: feeds['img1']?.buffer } }),
            release: () => Promise.resolve(),
          }),
      },
      Tensor: Object.assign(class extends StandInTensor {}, {
        fromGpuBuffer: (buffer: GPUBuffer) => ({ buffer }),
      }),
    } as unknown as Ort;
    const interpolator = await createInterpolator({
      model: new Uint8Array([0]),
      ...SIZE,
      platform: {
        frames: fakeFrames,
        importRuntime: () => Promise.resolve(fakeOrt),
        hasWebGpu: () => Promise.resolve(true),
        fetch: () => Promise.reject(new Error('unused')),
      },
    });
    expect(interpolator.backend).toBe('webgpu');
    const out = (await interpolator.between(
      grey(1, SIZE),
      grey(99, SIZE),
      0.5,
    )) as unknown as FakeFrame;
    expect([...out.rgba.slice(0, 4)]).toEqual([99, 99, 99, 255]);
    expect(output.dispose).toHaveBeenCalledOnce();
    await interpolator.destroy();
  });
});
