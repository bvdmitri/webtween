import { packPlanar, paddedSize, unpackPlanar } from '@webtween/core';
import { create, globals } from 'webgpu';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readBuffer } from './readback';
import { createTensorPipelines } from './tensors';

Object.assign(globalThis, globals);

// The GPU object is kept for the whole run: the native bindings must outlive their adapter.
const gpu = create([]);
// Opened in a hook: requesting the adapter while the module loads crashes the native bindings.
const opened: GPUDevice[] = [];
const device = (): GPUDevice => opened[0]!;
beforeAll(async () => {
  const adapter = await gpu.requestAdapter();
  if (adapter === null) throw new Error('no WebGPU adapter: the tensor shader tests need one');
  opened.push(await adapter.requestDevice());
});

afterAll(() => {
  device().destroy();
});

const SIZE = { width: 70, height: 13 };
const PADDED = paddedSize(SIZE);

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function texture(rgba: Uint8ClampedArray): GPUTexture {
  const target = device().createTexture({
    size: SIZE,
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device().queue.writeTexture({ texture: target }, rgba, { bytesPerRow: SIZE.width * 4 }, SIZE);
  return target;
}

function storage(bytes: number, data?: Float32Array<ArrayBuffer>): GPUBuffer {
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const buffer = device().createBuffer({ size: bytes, usage });
  if (data !== undefined) device().queue.writeBuffer(buffer, 0, data);
  return buffer;
}

describe('the tensor shaders', () => {
  it('pack a frame into planes as packPlanar does, edges repeated into the padding', async () => {
    const next = random(3);
    const rgba = new Uint8ClampedArray(SIZE.width * SIZE.height * 4).map(() => next() * 256);
    const pipelines = createTensorPipelines(device(), { size: SIZE, padded: PADDED });
    const planar = storage(pipelines.planarBytes);
    const encoder = device().createCommandEncoder();
    pipelines.pack(encoder, texture(rgba), planar);
    device().queue.submit([encoder.finish()]);
    const got = new Float32Array(await readBuffer(device(), planar, pipelines.planarBytes));
    const expected = packPlanar(rgba, SIZE, PADDED);
    expect(got).toHaveLength(expected.length);
    const worst = Math.max(...got.map((value, index) => Math.abs(value - (expected[index] ?? 0))));
    expect(worst).toBeLessThan(1e-6);
  });

  it('unpack planes to opaque RGBA bytes as unpackPlanar does', async () => {
    const next = random(5);
    const pipelines = createTensorPipelines(device(), { size: SIZE, padded: PADDED });
    const values = new Float32Array(pipelines.planarBytes / 4).map(() => next() * 1.4 - 0.2);
    const rgba = storage(pipelines.rgbaBytes);
    const encoder = device().createCommandEncoder();
    pipelines.unpack(encoder, storage(pipelines.planarBytes, values), rgba);
    device().queue.submit([encoder.finish()]);
    const got = new Uint8Array(await readBuffer(device(), rgba, pipelines.rgbaBytes));
    const expected = unpackPlanar(values, SIZE, PADDED);
    expect(got).toHaveLength(expected.length);
    const worst = Math.max(...got.map((value, index) => Math.abs(value - (expected[index] ?? 0))));
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('size their buffers for the padded planes and the frame', () => {
    const pipelines = createTensorPipelines(device(), { size: SIZE, padded: PADDED });
    expect(pipelines.planarBytes).toBe(3 * PADDED.width * PADDED.height * 4);
    expect(pipelines.rgbaBytes).toBe(SIZE.width * SIZE.height * 4);
    pipelines.destroy();
  });
});
