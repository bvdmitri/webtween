import { microseconds, paddedSize, type Size } from '@webtween/core';
import {
  loadRuntime,
  openPreferred,
  runtimeDevice,
  type Backend,
  type ModelSession,
} from '@webtween/onnx';

import { cpuEngine, gpuEngine, type Engine } from './engines';
import { asWebtweenError, WebtweenError } from './errors';
import { browserPlatform, type Platform } from './platform';

/**
 * How to make an {@link Interpolator}.
 *
 * @remarks `model` is the model's bytes, or a URL fetched when the interpolator is created and not
 * before. `width` and `height` are the frames' visible size. `backend: 'wasm'` keeps the model off
 * the GPU; the default uses WebGPU where the browser has it. `wasmPaths` is where onnxruntime-web's
 * WebAssembly files are served from, when not beside the bundle.
 */
export interface InterpolatorOptions {
  readonly model: ArrayBuffer | Uint8Array<ArrayBuffer> | URL | string;
  readonly width: number;
  readonly height: number;
  readonly backend?: 'auto' | 'wasm';
  readonly wasmPaths?: string;
  readonly platform?: Platform;
}

/**
 * Generates frames between two frames of one size.
 *
 * @remarks `between(a, b, t)` returns a new RGBA frame showing time `t` from 0 (`a`) to 1 (`b`),
 * timestamped between them; the caller closes it and still owns `a` and `b`. Asking for several
 * `t` of one pair in a row reads the pair once. Calls must not overlap. `destroy` frees the model.
 */
export interface Interpolator {
  readonly backend: Backend;
  readonly width: number;
  readonly height: number;
  between(a: VideoFrame, b: VideoFrame, t: number): Promise<VideoFrame>;
  destroy(): Promise<void>;
}

async function modelBytes(
  options: InterpolatorOptions,
  platform: Platform,
): Promise<Uint8Array<ArrayBuffer>> {
  const { model } = options;
  if (model instanceof Uint8Array) return model;
  if (model instanceof ArrayBuffer) return new Uint8Array(model);
  try {
    return await platform.fetch(String(model));
  } catch (error) {
    throw asWebtweenError('model-unavailable', error);
  }
}

interface Opened {
  readonly session: ModelSession;
  readonly device: GPUDevice | undefined;
}

async function open(options: InterpolatorOptions, platform: Platform): Promise<Opened> {
  const bytes = await modelBytes(options, platform);
  const hasGpu = options.backend !== 'wasm' && (await platform.hasWebGpu());
  let ort;
  try {
    const runtime = options.wasmPaths === undefined ? {} : { wasmPaths: options.wasmPaths };
    ort = await loadRuntime(() => platform.importRuntime(), runtime);
  } catch (error) {
    throw asWebtweenError('runtime-unavailable', error);
  }
  let session;
  try {
    session = await openPreferred(ort, bytes, hasGpu);
  } catch (error) {
    throw asWebtweenError('model-invalid', error);
  }
  // The shaders run on the runtime's own device, where the model's buffers live.
  const device = session.backend === 'webgpu' ? await runtimeDevice(ort) : undefined;
  return { session, device };
}

function checkFrame(frame: VideoFrame, size: Size, platform: Platform): void {
  const { width, height } = platform.frames.size(frame);
  if (width !== size.width || height !== size.height) {
    throw new WebtweenError(
      'frame-size',
      `the interpolator takes ${size.width}x${size.height} frames, got ${width}x${height}`,
    );
  }
}

/**
 * Load the model and open it on the best backend here: WebGPU where the browser has it, WASM
 * otherwise. Nothing of onnxruntime-web or the model loads before this is called.
 *
 * @throws {WebtweenError} `model-unavailable`, `runtime-unavailable` or `model-invalid`.
 */
export async function createInterpolator(options: InterpolatorOptions): Promise<Interpolator> {
  const platform = options.platform ?? browserPlatform();
  const size = paddedSize({ width: options.width, height: options.height }, 1);
  const sizes = { size, padded: paddedSize(size) };
  const { session, device } = await open(options, platform);
  const engine: Engine =
    device !== undefined && session.backend === 'webgpu'
      ? gpuEngine({ session, device }, sizes, platform.frames)
      : cpuEngine(session, sizes, platform.frames);
  return {
    backend: session.backend,
    ...size,
    between: async (a, b, t): Promise<VideoFrame> => {
      if (!(t >= 0 && t <= 1)) throw new RangeError(`t must be from 0 to 1, got ${t}`);
      for (const frame of [a, b]) checkFrame(frame, size, platform);
      const rgba = await engine.generate([a, b], t);
      const [from, to] = [a.timestamp, b.timestamp];
      return platform.frames.make(rgba, size, microseconds(from + Math.round(t * (to - from))));
    },
    destroy: async (): Promise<void> => {
      engine.destroy();
      await session.release();
    },
  };
}
