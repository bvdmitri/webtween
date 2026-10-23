# ADR 0007: A slowdown covers several segments, each with its own factor

Status: accepted (2026-10-23), extends ADR 0006

## Context

An edit often slows more than one moment of a clip (an exit, then a landing), each by a different
amount. Slowing them in separate passes would need the caller to cut, slow and join the stream, and
to compose the time maps itself.

## Decision

- **`slowdownSegments(segments)`** in `packages/core/src/timeline/slowdown.ts` is checked: each
  segment a range that runs forward with a factor from 1 to 16, the segments sorted and not
  overlapping (one may start where the one before it ends). No segments leaves time as it is.
- **`slowdown(factor, range)`** is the one-segment case; `slowdown(factor)` without a range still
  slows the whole video.
- **`outputTime` and `sourceTimeAt`** are piecewise linear: each segment stretched by its factor,
  what lies between and after the segments shifted by the stretch before it.
- `planPair`, `planLast` and `slowStream` are unchanged: they read only the time map, so a pair
  inside a segment gets that segment's frames and a pair between segments gets none.
- **`@bvdmitri/webtween`** takes either `factor` with an optional `range`, or `segments`, in
  seconds; giving both throws a `RangeError`, as invalid input does.

## Consequences

- One stream, one pass, one time map for the caller to keep things in step with.
- The rounding contract holds for every segment: `slowdownTimeline(options).output` of a source
  frame's time is exactly the timestamp `slowDown` gives that frame.
