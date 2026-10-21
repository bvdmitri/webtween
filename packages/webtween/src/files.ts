/**
 * The model file the package ships in its `models/` folder, beside `models/manifest.json` (its
 * size, SHA-256 and source): `@bvdmitri/webtween/models/rife-4.25-fp32.onnx`.
 */
export const MODEL_FILE = 'rife-4.25-fp32.onnx';

/**
 * The onnxruntime-web version webtween runs on, and the files of it an application serves itself
 * (from `onnxruntime-web/dist/` of that exact version) when it passes `wasmPaths`.
 */
export const ONNXRUNTIME_WEB_VERSION = '1.30.0';
export const RUNTIME_FILES = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
] as const;

/**
 * Where the model is when none is given: the package's own copy, found from this module's URL,
 * which bundlers that follow `new URL(..., import.meta.url)` emit as an asset.
 */
export function defaultModel(): URL {
  return new URL('../models/rife-4.25-fp32.onnx', import.meta.url);
}
