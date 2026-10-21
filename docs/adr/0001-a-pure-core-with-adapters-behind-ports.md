# ADR 0001: A pure core with adapters behind ports

Status: accepted (2026-10-21)

## Context

Slowing a video down mixes three kinds of work: deciding which frames to make and when they show,
laying pixels out for a network, and running that network on a GPU or on WebAssembly. Only the
first two are logic that can be tested exhaustively; the third depends on a browser, a GPU and a
20 MB model. web360 separates them the same way and has kept its logic testable to the last branch.

## Decision

- **`packages/core` is pure TypeScript** with no runtime dependency, no browser and no Node API:
  the timeline (`timeline/`), the pixel layout (`pixels/`) and units (`shared/units/`).
- **Adapters implement what the core leaves open**: `packages/adapters/onnx` runs the model,
  `packages/adapters/webgpu` packs and unpacks on the GPU. They import the core only, never each
  other.
- **`packages/webtween` wires them** to the browser through a `Platform`, which tests replace.
- `.dependency-cruiser.cjs` enforces the direction of every import.

## Consequences

- The timeline and the pixel layout are tested with property tests and mutation testing, without a
  browser.
- Every shader has its CPU reference in the core, which its Dawn test compares against.
- Code that needs a real browser (frame reading with `copyTo`, `fetch`, `navigator.gpu`) stays thin
  in `platform.ts`, tested with stand-ins.
