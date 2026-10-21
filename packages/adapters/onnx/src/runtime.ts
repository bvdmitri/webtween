import { ModelContractError, openSession, type ModelSession, type Ort } from './session';

/** Where onnxruntime-web finds its WebAssembly files: a URL prefix, or the bundler's own copy. */
export interface RuntimeOptions {
  readonly wasmPaths?: string;
}

/** Every core, as onnxruntime-web reads a thread count of 0. */
const ALL_CORES = 0;

/**
 * Import onnxruntime-web through `importer` and configure it. Nothing of the runtime (about
 * 27 MB of WebAssembly) loads before this is called.
 *
 * @remarks WebAssembly threads need a cross-origin isolated page; elsewhere the runtime runs on
 * one thread.
 */
export async function loadRuntime(
  importer: () => Promise<Ort>,
  options: RuntimeOptions,
): Promise<Ort> {
  const ort = await importer();
  if (options.wasmPaths !== undefined) ort.env.wasm.wasmPaths = options.wasmPaths;
  const isIsolated = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  ort.env.wasm.numThreads = isIsolated ? ALL_CORES : 1;
  return ort;
}

/**
 * Open the model on WebGPU when `hasDevice`, and on WASM when there is no device or WebGPU
 * cannot open it. A model that breaks the contract fails on either, so it is not retried.
 */
export async function openPreferred(
  ort: Ort,
  bytes: Uint8Array,
  hasDevice: boolean,
): Promise<ModelSession> {
  if (hasDevice) {
    try {
      return await openSession(ort, bytes, 'webgpu');
    } catch (error) {
      if (error instanceof ModelContractError) throw error;
    }
  }
  return openSession(ort, bytes, 'wasm');
}

/**
 * The GPU device onnxruntime-web runs its WebGPU sessions on, once one is open: the device the
 * shaders that feed the model must use, since a buffer belongs to one device.
 *
 * @remarks onnxruntime-web makes its own device with the limits the model needs; a device handed
 * to it beforehand is not used by its native WebGPU backend.
 */
export async function runtimeDevice(ort: Ort): Promise<GPUDevice> {
  return ort.env.webgpu.device;
}
