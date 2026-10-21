# ADR 0004: The model and the shaders share one GPU device

Status: accepted (2026-10-21)

## Context

The model takes planar float tensors padded to multiples of 64; frames are RGBA bytes of any size.
Converting on the CPU costs two passes over every pixel per frame plus copying the tensors to and
from the GPU. onnxruntime-web accepts GPU buffers as inputs (`Tensor.fromGpuBuffer`), can leave
outputs on the GPU (`preferredOutputLocation: 'gpu-buffer'`), and reports the device it runs its
WebGPU sessions on (`env.webgpu.device`). A GPU buffer belongs to one device, so the shaders that
fill the model's inputs must run on that device. web360 found that handing a decoded
frame to WebGPU by import or `copyExternalImageToTexture` loses the device on some headless
browsers, while `VideoFrame.copyTo` as RGBA then `writeTexture` works everywhere (its ADR 0022).

## Decision

- **The runtime's device is the shaders' device**: onnxruntime-web makes its device (with the
  limits the model needs) when the first WebGPU session opens, and webtween builds its shaders on
  it (`runtimeDevice`). The platform only answers whether the browser has WebGPU
  (`hasWebGpu`).
- **Frames reach the GPU as RGBA**: `copyTo` then `writeTexture`, once per pair of frames; asking
  for several `t` of one pair reuses the packed input.
- **Packing, inference and unpacking stay on the device**: the pack shader fills the model's input
  buffers, the model's output stays a GPU buffer, the unpack shader turns it into RGBA bytes, and
  those are read back once per generated frame to make a `VideoFrame`.
- **The shaders match the core's `packPlanar` and `unpackPlanar`**, checked on Dawn.

## Consequences

- A generated frame costs one upload per source frame and one readback, not tensor round trips.
- Importing frames without the CPU copy, and handing frames out without the readback (a canvas
  frame), are possible later speedups where the browser allows them.
