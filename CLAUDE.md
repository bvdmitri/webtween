# webtween: operating manual

webtween is a library that slows video down smoothly in the browser: it generates the frames
between two frames with a neural network (RIFE), on WebGPU where the browser has it and on
WebAssembly otherwise. It takes and gives decoded `VideoFrame`s. It is not a player and not a
muxer. This file is the operating manual for anyone (human or agent) changing the code.

The repository is private and the package is not published yet (`"private": true`). It is built
as if it were public, so going public is a decision, not a cleanup.

## How to start any task

1. Read the relevant doc in `docs/` before touching an area. `docs/` is the source of truth.
2. If the docs do not cover what you need, ask. Once decided, update the doc in the same change.
3. Write the failing test first, then the code that makes it pass, then refactor.
4. If a change contradicts a doc, stop and ask whether to change the doc or the code. A code
   change that contradicts its doc is incomplete.

## Where things are described

| Topic                                          | Document                                       |
| ---------------------------------------------- | ---------------------------------------------- |
| Where the work stands and what is next         | [docs/roadmap.md](./docs/roadmap.md)           |
| Layers, packages, dependency rules, public API | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| The model: its contract, source and export     | [docs/MODEL.md](./docs/MODEL.md)               |
| Private samples and committed fixtures         | [docs/SAMPLES.md](./docs/SAMPLES.md)           |
| Decisions and their reasons                    | `docs/adr/`                                    |

## Hard rules

1. **TDD, always.** Every function starts as a failing test. Timing and pixel maths also get
   property tests (fast-check). Coverage gates: 95% lines, 90% branches. Mutation testing
   (Stryker) on the core breaks below 80%.
2. **The core is pure.** No browser API, no Node API, no npm runtime dependency in
   `packages/core`. The model runtime, the GPU and frames are adapters behind ports.
3. **Every GPU shader has a CPU reference in the core**, and a test that runs the shader on Dawn
   and compares it with the reference.
4. **No player, no muxer.** No playback state, clocks, audio or containers in any published
   package. Decoding, encoding and audio belong to the application.
5. **Nothing loads until it is used.** Importing webtween costs nothing: onnxruntime-web and the
   model load only when an interpolator is created, and nothing reads a browser global at import.
6. **The model is documented and reproducible.** Its contract (inputs, outputs, ranges, the size
   alignment) and its provenance are in `docs/MODEL.md`. It is built only by `tools/export`, from
   upstream files pinned by hash, and checked against PyTorch by its tests. Model files are never
   committed; only the few-hundred-byte test fixture is.
7. **Strict lint, zero warnings.** Complexity 8, nesting 3, 30 lines a function, 300 lines a
   file, 3 parameters, no magic numbers. Fix the design rather than disable a rule. The Python
   export follows the same limits through ruff.
8. **Units are types.** Use the branded units in `shared/units`; convert explicitly.
9. **Document contracts with TSDoc.** Exported types and functions that other modules rely on get
   a docstring: a one-line summary, then why, when, and the invariants. Do not restate the type.
10. **Comments and docs describe the present.** No "previously", "used to", "no longer". History
    belongs in git and the changelog.
11. **No em or en dashes** anywhere: code, comments, docs, commit messages. The repository
    checks reject them.
12. **Private samples never leak.** Nothing from `samples/` or its catalogue terms reaches a
    commit; the pre-commit and commit-msg hooks enforce it.
13. **Pin everything.** Exact dependency versions, committed lockfiles (`pnpm-lock.yaml`,
    `tools/export/uv.lock`), CI actions pinned to a commit.
14. **Keep `CHANGELOG.md` current** for every user-visible change.

## Commands

```sh
pnpm verify          # the full gate: checks, typecheck, lint, format, dependency rules, tests
pnpm test            # all tests
pnpm vitest run --project core   # one project
pnpm test:mutation   # Stryker on the core
pnpm checks          # repository checks over every tracked file

cd tools/export
uv run webtween-export fetch     # the Practical-RIFE release, checked by hash
uv run webtween-export build     # models/rife-4.25-fp32.onnx and its manifest
uv run pytest && uv run ruff check . && uv run ruff format --check .

pnpm --filter @webtween/demo dev # the demo page
```

Run `pnpm verify` before calling any change done, and the export's checks when touching
`tools/export`.
