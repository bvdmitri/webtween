# webtween

[![CI](https://github.com/bvdmitri/webtween/actions/workflows/ci.yml/badge.svg)](https://github.com/bvdmitri/webtween/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/bvdmitri/webtween/branch/main/graph/badge.svg)](https://codecov.io/gh/bvdmitri/webtween)
[![npm](https://img.shields.io/npm/v/@bvdmitri/webtween)](https://www.npmjs.com/package/@bvdmitri/webtween)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://bvdmitri.github.io/webtween/)
[![license](https://img.shields.io/npm/l/@bvdmitri/webtween)](./LICENSE)

Smooth slow motion in the browser: frames generated between frames by a neural network (RIFE),
on WebGPU, from decoded `VideoFrame`s to decoded `VideoFrame`s.

webtween is a library, not a player or a muxer: decoding, encoding, audio and playback belong to
the application that uses it. It is published on npm as
[`@bvdmitri/webtween`](https://www.npmjs.com/package/@bvdmitri/webtween), with its documentation at
[bvdmitri.github.io/webtween](https://bvdmitri.github.io/webtween/).

## What it does

- **Generates the frame at any time between two frames** with RIFE 4.25, on WebGPU through
  onnxruntime-web, or on WebAssembly where the browser has no WebGPU.
- **Slows a stream down** by a factor from 1 to 16, over the whole video or a range, streaming two
  frames at a time.
- **Maps time both ways** between the source and the slowed video, so captions or camera paths
  stay in step.
- **Loads nothing until used**: the runtime and the model download when an interpolator is
  created.

See [the getting-started guide](./docs/guide/getting-started.md) for usage, and
[docs/MODEL.md](./docs/MODEL.md) for the model and how it is built.

## Development

Requires Node 24 or 26, pnpm 11, Git LFS, and for the model export Python with uv.

```sh
pnpm install
pnpm verify                      # checks, typecheck, lint, format, dependency rules, tests

cd tools/export
uv run webtween-export fetch     # Practical-RIFE 4.25, checked by hash
uv run webtween-export build     # models/rife-4.25-fp32.onnx

pnpm --filter @webtween/demo dev # the demo page
```

[CLAUDE.md](./CLAUDE.md) holds the rules every change follows.

## License

MIT for the code. The model is exported from
[Practical-RIFE](https://github.com/hzwer/Practical-RIFE), whose code and weights are MIT.
