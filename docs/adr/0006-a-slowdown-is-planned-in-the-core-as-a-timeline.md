# ADR 0006: A slowdown is planned in the core as a timeline

Status: accepted (2026-10-21), extended by ADR 0007

## Context

Slowing down is a change of time: source time inside a range lasts `factor` times longer, time
outside keeps its pace. Which frames to generate, at which `t`, and when each shows all follow from
that map. Callers also keep their own things in source time (a keyframed camera path in cutaway)
and need the same map to stay in sync.

## Decision

- **`slowdown(factor, range?)`** is checked: a factor from 1 to 16 (fractions allowed), a range
  that runs forward, the whole video when absent.
- **`outputTime` and `sourceTimeAt`** are the map and its inverse: continuous and strictly
  increasing, the range stretched, what follows shifted.
- **`planPair(a, b)`** fills the output span of a pair of source frames with as many frames as
  the source spacing fits, evenly spaced in output time, each generated frame's `t` the source
  time it shows. Inside a range with a whole factor that is `factor - 1` frames at `k / factor`;
  outside, none. Timings are whole microseconds and tile the span with no gap.
- **`slowStream`** streams any frame type through a `Tweener` port, holding at most two source
  frames and closing each once used, also on abort or an early stop.
- **`slowdownTimeline`** gives the map in seconds to callers.

## Consequences

- The output frame rate equals the source's inside and outside the range, so an encoder needs no
  change of rate.
- A pair that straddles a range edge gets the frames its output span fits, at the times they show.
