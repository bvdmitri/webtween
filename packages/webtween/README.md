# @bvdmitri/webtween

[![npm](https://img.shields.io/npm/v/@bvdmitri/webtween)](https://www.npmjs.com/package/@bvdmitri/webtween)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://bvdmitri.github.io/webtween/)
[![CI](https://github.com/bvdmitri/webtween/actions/workflows/ci.yml/badge.svg)](https://github.com/bvdmitri/webtween/actions/workflows/ci.yml)

Smooth slow motion in the browser: frames generated between frames by a neural network (RIFE 4.25),
on WebGPU, from decoded `VideoFrame`s to decoded `VideoFrame`s. Decoding, encoding and audio stay
with your application.

```ts
import { createInterpolator, slowDown } from '@bvdmitri/webtween';

const interpolator = await createInterpolator({
  width: 1920,
  height: 1080,
  model: '/webtween/0.2.1/rife-4.25-fp32.onnx', // or leave it out: the package's own copy
  wasmPaths: '/webtween/0.2.1/', // where onnxruntime-web's WebAssembly files are served
});
for await (const frame of slowDown(decode(), {
  interpolator,
  factor: 2,
  range: { start: 3, end: 5 },
})) {
  await encoder.add(frame);
  frame.close();
}
await interpolator.destroy();
```

## Files to serve

- **The model** ships in the package: `@bvdmitri/webtween/models/rife-4.25-fp32.onnx` (about 23 MB),
  with `models/manifest.json` (its size and SHA-256). The version you install pins the model.
- **onnxruntime-web's WebAssembly**: `RUNTIME_FILES` (`ort-wasm-simd-threaded.jsep.wasm` and
  `.mjs`) from `onnxruntime-web/dist/` at exactly `ONNXRUNTIME_WEB_VERSION` (the version webtween
  depends on). Pass their folder as `wasmPaths`.

Both are fetched with a plain `fetch` when `createInterpolator` runs, never before, so serving them
with a long `Cache-Control` at a versioned path lets the browser keep them.

## License

MIT for the code; the model is exported from [Practical-RIFE](https://github.com/hzwer/Practical-RIFE)
(MIT code and weights).
