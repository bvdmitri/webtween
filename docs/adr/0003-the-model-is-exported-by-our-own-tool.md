# ADR 0003: The model is exported from Practical-RIFE by our own tool

Status: accepted (2026-10-21)

## Context

Ready RIFE models in ONNX exist, but their provenance is mixed: the most used browser-ready one
mirrors an export made by a script licensed for non-commercial use, and none says how it was made
in a way we can repeat. They also keep RIFE's "ensemble" pass, which doubles the work per frame.
Practical-RIFE publishes its code and weights under MIT.

## Decision

- **`tools/export`**, a Python project locked with uv, fetches the Practical-RIFE 4.25 release and
  checks the archive, the network code and the weights by SHA-256 before using them.
- **Our wrapper and warp** put the network behind the model contract and make the graph run at any
  frame size (docs/MODEL.md). The release's own code defines the network; ours only replaces its
  size-bound warp and drops the layers only training uses.
- **Its tests are the specification**: ONNX against PyTorch at several sizes from one graph, the
  generated frame against known motion, and the warp against the published warp.
- **Model files are build outputs**, written to `models/` and never committed. The test fixture
  (a few hundred bytes) is.

## Consequences

- The model anyone ships is reproducible from pinned inputs and carries Practical-RIFE's MIT terms.
- Building it needs Python, PyTorch and a download of about 23 MB; CI does not, since the
  TypeScript tests run on the fixture.
- Publishing a model for others to fetch (a release asset, Hugging Face) is a later decision.
