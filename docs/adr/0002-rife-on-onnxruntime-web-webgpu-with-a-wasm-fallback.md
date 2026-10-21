# ADR 0002: RIFE on onnxruntime-web, WebGPU with a WASM fallback

Status: accepted (2026-10-21)

## Context

Smooth slow motion needs frames that were never recorded. Blending neighbours ghosts; classic
optical flow breaks on occlusions. Learned frame interpolation (Final Cut Pro's "machine learning"
optical flow is one) handles both far better. RIFE is the open, fast family of such networks, with
MIT code and weights in Practical-RIFE. In a browser a network runs on a GPU through WebGPU, or on
the CPU through WebAssembly, and onnxruntime-web provides both behind one API.

## Decision

- **The network is RIFE 4.25** from Practical-RIFE, exported to ONNX (ADR 0003, docs/MODEL.md).
- **It runs on onnxruntime-web 1.30.0 through its main entry** (`import('onnxruntime-web')`),
  whose WebGPU backend (JSEP) and WASM backend both compute RIFE correctly. The
  `onnxruntime-web/webgpu` entry's native WebGPU backend does not: on a smooth pattern moving 4
  pixels its halfway frame is off by a mean of 0.035, against 0.002 for JSEP and WASM (Chrome,
  Apple M2 Pro), and its frames show visible artifacts. It is not used until it agrees.
- **WebGPU first**: `openPreferred` opens the model on WebGPU when the browser has a device, and
  on WASM when it has none or WebGPU cannot open the model. A model that breaks the contract fails
  on both, so it is not retried.
- **WASM threads only where allowed**: on a cross-origin isolated page the runtime uses every
  core; elsewhere it runs on one thread, so pages need no COOP and COEP headers.

## Consequences

- Any browser runs webtween; one with WebGPU runs it at a usable speed. Measured in the demo
  (Chrome, Apple M2 Pro, float32 model): about 177 ms per generated frame at 720p and 398 ms at
  1080p on WebGPU; about 460 ms at 360p and 1.7 s at 720p on one-thread WASM.
- The WASM path in Node is how the adapter and the exported model are tested, with no browser.
- The model is the runtime's largest input and the runtime's WebAssembly the second (about 27
  MB); both load only on demand (ADR 0005).
