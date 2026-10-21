import { defineConfig } from 'tsdown';

// One ESM entry and its declarations. The core and the adapters are workspace packages, bundled
// in; onnxruntime-web stays an import, loaded only when an interpolator is created.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
  dts: { eager: true },
  deps: { alwaysBundle: [/^@webtween\//] },
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  // The declarations name WebGPU types, which the package's own dependency provides.
  banner: { dts: '/// <reference types="@webgpu/types" />' },
});
