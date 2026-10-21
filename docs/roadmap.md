# Roadmap

What webtween does today and what comes next. Read it with [CLAUDE.md](../CLAUDE.md) (the rules)
and the pages beside it.

## What exists

- **The model** ([MODEL.md](./MODEL.md)): RIFE 4.25 from Practical-RIFE, exported to ONNX by
  `tools/export` from hash-pinned inputs, float32, any size in multiples of 64, checked against
  PyTorch.
- **The timeline** (`packages/core/src/timeline`): a slowdown by a factor from 1 to 16 over the
  whole video or a range, its time map both ways, and a streaming slowdown over any frame type
  (ADR 0006).
- **The runtime** (`packages/adapters/onnx`): the model on onnxruntime-web, WebGPU first with a
  WASM fallback, loaded only on demand (ADR 0002, 0005).
- **The shaders** (`packages/adapters/webgpu`): frames packed into the model's input and its output
  unpacked, on the model's own device (ADR 0004).
- **The API** (`@bvdmitri/webtween`, private): `createInterpolator`, `slowDown`,
  `slowdownTimeline`.
- **The demo** (`tools/demo`): pick a clip, slow it down 2x or 4x, download the MP4.

## What is next

- **Faster frames**: measured in the demo (Chrome, Apple M2 Pro, float32), a generated frame
  takes about 177 ms at 720p and 398 ms at 1080p on WebGPU, and 1.7 s at 720p on one-thread
  WASM. Measure on real clips and other GPUs, and try onnxruntime-web's native WebGPU backend again
  once it computes RIFE correctly (ADR 0002).
- **A cheaper mode**: none is planned soon. A float16 model is not built (float32 is fast enough
  for an export), and running the flow at half resolution would trade quality for speed; at about
  398 ms per generated frame at 1080p, a slowed 1080p export is practical and 4K is not.
- **Fewer copies**: import decoded frames without `copyTo`, and hand generated frames out without
  a readback, where the browser allows it.
- **cutaway**: slow motion in its export worker, its keyframed views kept in sync through
  `slowdownTimeline`, the model and the runtime served by cutaway itself.
- **Going public**: publish the model with its manifest, a release workflow and the docs site, as
  web360 has.

Audio, containers and playback stay out of scope: they belong to the application.
