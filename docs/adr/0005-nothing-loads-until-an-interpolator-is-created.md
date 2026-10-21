# ADR 0005: Nothing loads until an interpolator is created

Status: accepted (2026-10-21)

## Context

An application offers slow motion as one export option among others. The model (about 23 MB) and
onnxruntime-web's WebAssembly (about 27 MB) should cost nothing to a user who never picks it, and
importing webtween must not fail in a browser without WebGPU.

## Decision

- **`createInterpolator` is the only door**: it fetches a model given by URL, then imports
  onnxruntime-web with `import()`, then opens the session. Before it is called nothing is fetched
  or imported.
- **No browser global is read at import**: GPU usage flags and `navigator` are read inside the
  functions that need them.
- **`destroy()` releases the session and every GPU resource**, so the memory goes back once the
  export is done.
- **The host decides where files come from**: the model as bytes or a URL, the runtime's
  WebAssembly through `wasmPaths`, so an application can serve both itself.

## Consequences

- An application can import webtween eagerly and still pay for slow motion only when used.
- The first slowdown waits for the downloads; an application shows that as part of its progress.
