# Architecture

webtween is a hexagonal TypeScript monorepo, built like its sibling web360. The core is pure: it
knows no browser API, no Node API and no npm package. The model runtime and the GPU are adapters,
and the published package wires them to the browser. `.dependency-cruiser.cjs` enforces the
import rules below.

## Packages

| Path                       | Role                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`            | `@webtween/core`: the slowdown timeline, the streaming slowdown over any frame type, and the pixel layout the model takes. No runtime dependencies.     |
| `packages/adapters/onnx`   | `@webtween/onnx`: the model on onnxruntime-web (`openSession`, `openPreferred`, `loadRuntime`), checked against the contract. Depends on the core only. |
| `packages/adapters/webgpu` | `@webtween/webgpu`: the WGSL shaders that pack a frame into the model's input and unpack its output (`createTensorPipelines`), and `readBuffer`.        |
| `packages/webtween`        | `@bvdmitri/webtween`, the package: the public API, wiring the core to the adapters and the browser. It bundles the workspace packages.                  |
| `tools/checks`             | The repository checks: no em or en dashes, no private sample terms.                                                                                     |
| `tools/docs`               | The documentation site's link rewriting.                                                                                                                |
| `tools/export`             | Python: Practical-RIFE exported to ONNX, and the test fixture ([MODEL.md](./MODEL.md)).                                                                 |
| `tools/demo`               | A Vite page that slows down a picked clip and downloads the MP4. Not published.                                                                         |

## Inside the core

| Folder          | Holds                                                                                                                          | Imports   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `shared/units/` | Branded `Seconds` and `Microseconds` and their conversions                                                                     | nothing   |
| `timeline/`     | `slowdown` and `slowdownSegments`, `outputTime` and `sourceTimeAt` (the time map), `planPair` and `planLast`, and `slowStream` | `shared/` |
| `pixels/`       | `paddedSize`, and `packPlanar` and `unpackPlanar`: the model's layout and the shaders' CPU references                          | nothing   |

`slowStream` is generic over the frame type through a `Tweener` port (timing, retime, between,
close), so the core streams frames it never sees.

## How a frame is made

1. `slowDown` pairs consecutive source frames and asks the core's `planPair` which frames the pair
   holds in the output: the first frame retimed, then a `t` and a timing for each generated frame
   (ADR 0006, 0007).
2. For each generated frame, `Interpolator.between(a, b, t)` runs an engine:
   - **WebGPU** (`gpuEngine`): each frame of the pair is read as RGBA (`VideoFrame.copyTo`) and
     written to a texture once per pair; the pack shader fills the model's input buffers, the model
     runs on the same device with its output left on the GPU, the unpack shader writes RGBA bytes,
     and those are read back once (ADR 0004).
   - **WASM** (`cpuEngine`): the core packs and unpacks on the CPU and the model runs on
     onnxruntime-web's WebAssembly backend.
3. The bytes become a new RGBA `VideoFrame`, retimed by `slowDown`.

## Public API

`@bvdmitri/webtween` exports (`packages/webtween/src/index.ts`):

- `createInterpolator(options)`: loads the model (bytes or a URL) and onnxruntime-web, opens the
  model on WebGPU or WASM, and gives an `Interpolator` with `between(a, b, t)` and `destroy()`.
- `slowDown(frames, options)`: an async generator of the slowed-down frames of a frame stream, by
  `factor` over an optional `range` in seconds, or by `segments` each with its own factor, with
  `signal` and `onProgress`.
- `slowdownTimeline(options)`: the time map in seconds (`output`, `source`), for a caller keeping
  other things in source time.
- `WebtweenError` and its `WebtweenErrorCode`.
- `browserPlatform()`, `browserFrames` and the `Platform` and `FrameOps` types: the browser as
  webtween sees it, which a test replaces.

The core and the adapters are workspace packages, bundled into `@bvdmitri/webtween` by tsdown;
onnxruntime-web stays an import, loaded with `import()` when an interpolator is created (ADR 0005).
