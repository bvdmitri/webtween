# Getting started

webtween takes decoded `VideoFrame`s and gives the slowed-down stream back, with frames generated
between them. Decoding, encoding, audio and the container stay with your application; the example
below uses [Mediabunny](https://mediabunny.dev) for those, in a worker.

## Serve the model and the runtime

The package ships the model: `@bvdmitri/webtween/models/rife-4.25-fp32.onnx` (about 23 MB), beside
`models/manifest.json` with its size and SHA-256. By default `createInterpolator` fetches it from
the package (`new URL('../models/rife-4.25-fp32.onnx', import.meta.url)`, which bundlers emit as an
asset); an application that copies it to its own static folder passes that URL as `model`.

onnxruntime-web's WebAssembly is served by the application: `RUNTIME_FILES`
(`ort-wasm-simd-threaded.jsep.wasm`, about 28 MB, and its `.mjs`) from `onnxruntime-web/dist/`, at
exactly `ONNXRUNTIME_WEB_VERSION`. Pass their folder as `wasmPaths`.

Both are fetched with a plain `fetch` when `createInterpolator` runs and never before, so a
versioned path with `Cache-Control: public, max-age=31536000, immutable` serves them from the
browser's cache after the first use.

## Slow a clip down

```ts
import { createInterpolator, slowDown } from '@bvdmitri/webtween';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
} from 'mediabunny';

async function slowMotion(file: File, factor: number): Promise<ArrayBuffer> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const track = await input.getPrimaryVideoTrack();
  if (track === null) throw new Error('no video');

  const interpolator = await createInterpolator({
    model: '/webtween/0.2.0/rife-4.25-fp32.onnx',
    width: track.displayWidth,
    height: track.displayHeight,
    wasmPaths: '/webtween/0.2.0/',
  });

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const video = new VideoSampleSource({ codec: 'avc', bitrate: new Quality('high') });
  output.addVideoTrack(video);
  await output.start();

  async function* frames(): AsyncGenerator<VideoFrame> {
    for await (const sample of new VideoSampleSink(track).samples()) {
      yield sample.toVideoFrame();
      sample.close();
    }
  }

  for await (const frame of slowDown(frames(), { interpolator, factor })) {
    await video.add(new VideoSample(frame));
    frame.close();
  }
  await output.finalize();
  await interpolator.destroy();
  return output.target.buffer!;
}
```

- `factor` 2 plays at half speed, 4 at a quarter. Pass `range: { start, end }` in seconds to slow
  down only part of the clip.
- To slow several parts, each by its own factor, pass `segments` instead of `factor`:
  `segments: [{ start: 3, end: 5, factor: 2 }, { start: 8, end: 9, factor: 4 }]`. Segments are
  in seconds of the source, sorted, and do not overlap (one may start where the last ends); the
  source between them plays at its pace. Invalid options throw a `RangeError`.
- `slowDown` holds at most two source frames, and closes each once used. Close every frame you
  receive.
- `interpolator.backend` says where the model runs: `webgpu` or `wasm`.

## Keep other things in step

Anything you keep in source time (captions, a camera path) maps to the slowed video with
`slowdownTimeline`:

```ts
import { slowdownTimeline } from '@bvdmitri/webtween';

const timeline = slowdownTimeline({ factor: 2, range: { start: 3, end: 5 } });
timeline.output(4); // 5: one second into the range lands two seconds in
timeline.source(5); // 4

const two = slowdownTimeline({
  segments: [
    { start: 3, end: 5, factor: 2 },
    { start: 8, end: 9, factor: 4 },
  ],
});
two.output(6); // 8: two seconds later, after the first segment
two.output(9); // 14
```

## Frames from anywhere

Any `VideoFrame` works: a decoder's, or one made on another GPU device (web360's reframer,
websteady's canvas). The interpolator reads each pair once with `VideoFrame.copyTo` as RGBA, so the
device a frame came from does not matter; frames must be the interpolator's `width` and `height`.

## The timeline is exact

`slowdownTimeline(options).output(t)`, for the same options as `slowDown`, is rounded to whole microseconds as `slowDown`
times its frames, so for a source frame at `t` it is exactly the timestamp `slowDown` gives it.
Place silence or shift audio after each slowed part with it.

## Cost

A generated frame takes about 177 ms at 720p and 398 ms at 1080p on WebGPU (Chrome, Apple M2 Pro),
and seconds on WASM. No cheaper mode is planned soon; cap slowed exports at 1080p.

## Errors

`createInterpolator` throws a `WebtweenError` whose `code` is `model-unavailable` (the model could
not be fetched), `runtime-unavailable` (onnxruntime-web could not load), or `model-invalid` (the
bytes are not a model with webtween's inputs). `between` throws `frame-size` for a frame of
another size than the interpolator's.
