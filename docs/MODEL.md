# The model

webtween generates frames with RIFE (Real-Time Intermediate Flow Estimation), a network that
estimates the optical flow from a time `t` to each of two frames, warps both frames there, and
blends them with a learned mask. This page states what the exported model is, where it comes
from, and how it is built.

## Contract

Every model webtween runs, the real one and the test fixture, has these inputs and output. The
onnx adapter refuses a model without them (`ModelContractError`, surfaced as `model-invalid`).

| Name       | Shape                   | Type    | Meaning                                                       |
| ---------- | ----------------------- | ------- | ------------------------------------------------------------- |
| `img0`     | `[1, 3, height, width]` | float32 | The first frame: planes red, green, blue, values in 0..1      |
| `img1`     | `[1, 3, height, width]` | float32 | The second frame, the same way                                |
| `timestep` | `[1]`                   | float32 | `t` in 0..1: 0 shows `img0`, 1 shows `img1`                   |
| `output`   | `[1, 3, height, width]` | float32 | The frame at `t`, the same layout; values may stray past 0..1 |

- `height` and `width` are free, but each must be a multiple of **64** (`ALIGNMENT` in
  `packages/core/src/pixels/layout.ts`): the coarsest flow block works at 1/16 of the frame and
  its encoder halves that twice more. A frame of another size is padded up to the next multiple,
  repeating its edge pixels, and the output is cropped back (`packPlanar`, `unpackPlanar`, and
  the shaders in `packages/adapters/webgpu`).
- `t` is any value in 0..1, not only 0.5: one run per generated frame, at the time it shows.
- The output is clamped to 0..1 when it becomes bytes.

## Source

- **Project**: [hzwer/Practical-RIFE](https://github.com/hzwer/Practical-RIFE), MIT. Its README
  states that the trained models it links are under the same MIT license.
- **Version**: 4.25, which the README recommends by default. Released as one archive holding the
  network code (`IFNet_HDv3.py`) and the weights (`flownet.pkl`).
- **Pinned by hash** (`tools/export/src/webtween_export/upstream.py`):

  | File            | SHA-256                                                            |
  | --------------- | ------------------------------------------------------------------ |
  | `rife-4.25.zip` | `e63d481b7ae5d4a4e6ad7ac5b410ff78f3bf7be3b51b2e38ca8152747abde5b4` |
  | `IFNet_HDv3.py` | `655b4c772b037967b86c2dd31c8fa3b5323b79dd9a0e0088708d89149bbc8a32` |
  | `flownet.pkl`   | `6615790efd627772917205db291f51cd392528a157ecbb2ecaeec3bff8eb6de2` |

- The weights load with `torch.load(weights_only=True)`, so the archive's pickle cannot run code.
  The weights include the `teacher` and `caltime` layers that only training uses; the export
  drops exactly those and loads the rest strictly.

## Export

`tools/export` is a Python project (uv, `uv.lock`) that turns the release into ONNX:

- **The wrapper** (`wrapper.py`) puts the network behind the contract: it concatenates the
  frames, reshapes `timestep`, runs the five flow blocks at scales 16, 8, 4, 2, 1 (Practical-RIFE's
  scale 1.0), and returns the last merged frame. There is no ensemble pass (4.25 does not support
  one), so a frame costs one pass of the network.
- **The warp** is ours. Practical-RIFE's caches a sampling grid per frame size, which an exported
  graph would keep as a constant of the size it was traced at; ours builds the grid from the
  frame's shape inside the graph, so one model runs at every size. Its test checks it against the
  published warp.
- **ONNX**: opset 19, the TorchScript exporter, dynamic height and width, checked by
  `onnx.checker`. The graph uses GridSample, which onnxruntime-web's WebGPU backend supports.
- **Output**: `models/rife-4.25-fp32.onnx` (about 23 MB) and `models/manifest.json` (sizes, hashes,
  source, alignment). `models/` is ignored by git.

```sh
cd tools/export
uv run webtween-export fetch   # downloads the release into .upstream/, checking every hash
uv run webtween-export build   # writes models/
uv run webtween-export fixture # writes test/fixtures/model/blend.onnx
```

## Verified

The export's tests (`tools/export/tests`) run on the fetched release:

- ONNX matches PyTorch within 1e-4 at 64x64, 64x128 and 192x320 from one exported graph.
- On a smooth pattern moving 4 pixels, the frame at `t` = 0.25, 0.5 and 0.75 is within a mean
  absolute error of 0.01 of the pattern moved `4t` pixels.
- Two identical frames give that frame back within 0.01.

The onnx adapter's `session.real.test.ts` runs the exported model on onnxruntime-web (WASM, in
Node) and checks the halfway frame the same way.

## The test fixture

`test/fixtures/model/blend.onnx` (283 bytes, built by `webtween-export fixture`) has the contract's
inputs and output and computes `img0 + (img1 - img0) * t`. It lets every package test loading and
running a model without the real weights.

## Provisional

- A float16 model (about half the size) is not built yet: converting the graph with
  onnxconverter-common did not finish, and it is on the [roadmap](./roadmap.md).
