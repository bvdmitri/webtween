import { readFileSync } from 'node:fs';

import * as ort from 'onnxruntime-web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadRuntime, openPreferred, runtimeDevice } from './runtime';
import { ModelContractError, type Ort } from './session';

const blend = new Uint8Array(
  readFileSync(new URL('../../../../test/fixtures/model/blend.onnx', import.meta.url)),
);

function stand(): {
  ort: Ort;
  env: { wasm: Record<string, unknown>; webgpu: Record<string, unknown> };
} {
  const environment = { wasm: {}, webgpu: {} };
  return { ort: { env: environment } as unknown as Ort, env: environment };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadRuntime', () => {
  it('imports the runtime only when called, and points it at the WASM files', async () => {
    const { ort: fake, env } = stand();
    const importer = vi.fn(() => Promise.resolve(fake));
    expect(importer).not.toHaveBeenCalled();
    const loaded = await loadRuntime(importer, { wasmPaths: '/ort/' });
    expect(loaded).toBe(fake);
    expect(env.wasm).toEqual({ wasmPaths: '/ort/', numThreads: 1 });
  });

  it('lets WASM use every core when the page is cross-origin isolated', async () => {
    vi.stubGlobal('crossOriginIsolated', true);
    const { ort: fake, env } = stand();
    await loadRuntime(() => Promise.resolve(fake), {});
    expect(env.wasm).toEqual({ numThreads: 0 });
  });
});

describe('runtimeDevice', () => {
  it('is the device the runtime runs its WebGPU sessions on', async () => {
    const device = { label: 'runtime' } as unknown as GPUDevice;
    const fake = { env: { webgpu: { device: Promise.resolve(device) } } } as unknown as Ort;
    expect(await runtimeDevice(fake)).toBe(device);
  });
});

describe('openPreferred', () => {
  it('opens on WASM when there is no GPU device', async () => {
    const session = await openPreferred(ort, blend, false);
    expect(session.backend).toBe('wasm');
    await session.release();
  });

  it('falls back to WASM when WebGPU cannot open the model', async () => {
    // The Node build of onnxruntime-web has no WebGPU, so asking for it fails like a browser without it.
    const session = await openPreferred(ort, blend, true);
    expect(session.backend).toBe('wasm');
    await session.release();
  });

  it('does not fall back from a model that breaks the contract', async () => {
    const names = { inputNames: [], outputNames: [] };
    const wrong = {
      InferenceSession: { create: (): Promise<typeof names> => Promise.resolve(names) },
    };
    await expect(openPreferred(wrong as unknown as Ort, blend, true)).rejects.toThrow(
      ModelContractError,
    );
  });
});
