import { readFileSync } from 'node:fs';

import { packPlanar, paddedSize, unpackPlanar } from '@webtween/core';
import * as ort from 'onnxruntime-web';
import { describe, expect, it, type Mock, vi } from 'vitest';

import { ModelContractError, openSession, type Ort } from './session';

const blend = new Uint8Array(
  readFileSync(new URL('../../../../test/fixtures/model/blend.onnx', import.meta.url)),
);

describe('openSession on WASM', () => {
  it('runs the model on planar frames and returns the planar result', async () => {
    const session = await openSession(ort, blend, 'wasm');
    expect(session.backend).toBe('wasm');
    const size = { width: 2, height: 1 };
    const padded = paddedSize(size, 2);
    const black = packPlanar(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]), size, padded);
    const white = packPlanar(new Uint8ClampedArray(8).fill(255), size, padded);
    const out = await session.runOnCpu({ img0: black, img1: white, t: 0.25, size: padded });
    expect([...unpackPlanar(out, size, padded)]).toEqual([64, 64, 64, 255, 64, 64, 64, 255]);
    await session.release();
  });

  it('refuses a model without the contract inputs and output', async () => {
    const stand = fakeOrt({ inputNames: ['image'], outputNames: ['output'] });
    await expect(openSession(stand.ort, blend, 'wasm')).rejects.toThrow(ModelContractError);
    await expect(openSession(stand.ort, blend, 'wasm')).rejects.toThrow(
      'the model takes image and gives output; webtween needs img0, img1, timestep and output',
    );
  });
});

describe('openSession on WebGPU', () => {
  it('asks for GPU outputs and feeds GPU buffers as tensors of the padded size', async () => {
    const stand = fakeOrt();
    const session = await openSession(stand.ort, blend, 'webgpu');
    expect(stand.create).toHaveBeenCalledWith(blend, {
      executionProviders: ['webgpu'],
      preferredOutputLocation: 'gpu-buffer',
      graphOptimizationLevel: 'all',
    });
    const img0 = { label: 'a' } as unknown as GPUBuffer;
    const img1 = { label: 'b' } as unknown as GPUBuffer;
    const out = await session.runOnGpu({ img0, img1, t: 0.5, size: { width: 64, height: 128 } });
    expect(stand.fromGpuBuffer).toHaveBeenCalledWith(img0, {
      dataType: 'float32',
      dims: [1, 3, 128, 64],
    });
    const feeds = stand.run.mock.calls[0]?.[0] ?? {};
    expect(Object.keys(feeds)).toEqual(['img0', 'img1', 'timestep']);
    expect(feeds['timestep']?.data).toEqual(new Float32Array([0.5]));
    expect(out.buffer).toBe('gpu-output');
    out.dispose();
    expect(stand.disposed).toBe(1);
  });
});

interface ModelNames {
  readonly inputNames: string[];
  readonly outputNames: string[];
}

type Feeds = Record<string, { data?: Float32Array }>;

const CONTRACT_NAMES: ModelNames = {
  inputNames: ['img0', 'img1', 'timestep'],
  outputNames: ['output'],
};

/** A stand-in for onnxruntime-web's tensor: keeps what it was built from. */
class FakeTensor {
  public readonly type: string;
  public readonly data: Float32Array;
  public readonly dims: number[];

  public constructor(type: string, data: Float32Array, dims: number[]) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  }
}

const wrapBuffer = (buffer: unknown): { buffer: unknown } => ({ buffer });

interface FakeOrt {
  readonly ort: Ort;
  readonly create: ReturnType<typeof vi.fn>;
  readonly run: Mock<(feeds: Feeds) => Promise<unknown>>;
  readonly fromGpuBuffer: Mock<typeof wrapBuffer>;
  readonly disposed: number;
}

function fakeOrt(names: ModelNames = CONTRACT_NAMES): FakeOrt {
  const state = { disposed: 0 };
  const output = {
    gpuBuffer: 'gpu-output',
    dispose: (): void => {
      state.disposed += 1;
    },
  };
  const run = vi.fn<(feeds: Feeds) => Promise<unknown>>(() => Promise.resolve({ output }));
  const create = vi.fn(() => Promise.resolve({ ...names, run, release: vi.fn() }));
  const fromGpuBuffer = vi.fn(wrapBuffer);
  const tensor = Object.assign(class extends FakeTensor {}, { fromGpuBuffer });
  const fake = { InferenceSession: { create }, Tensor: tensor } as unknown as Ort;
  return {
    ort: fake,
    create,
    run,
    fromGpuBuffer,
    get disposed(): number {
      return state.disposed;
    },
  };
}
