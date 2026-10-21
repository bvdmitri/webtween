# Getting started

webtween takes decoded `VideoFrame`s and gives the slowed-down stream back, with frames generated
between them. Decoding, encoding, audio and the container stay with your application; the example
below uses [Mediabunny](https://mediabunny.dev) for those, in a worker.

## Serve the model and the runtime

Build the model ([MODEL.md](../MODEL.md)) and serve `rife-4.25-fp32.onnx` from your site. Serve
onnxruntime-web's WebAssembly files too (`node_modules/onnxruntime-web/dist/*.wasm` and `*.mjs`;
webtween uses `ort-wasm-simd-threaded.jsep.*`),
or let your bundler copy them, and pass their folder as `wasmPaths`. Neither is fetched before
you create an interpolator.

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
    model: '/models/rife-4.25-fp32.onnx',
    width: track.displayWidth,
    height: track.displayHeight,
    wasmPaths: '/ort/',
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
```

## Errors

`createInterpolator` throws a `WebtweenError` whose `code` is `model-unavailable` (the model could
not be fetched), `runtime-unavailable` (onnxruntime-web could not load), or `model-invalid` (the
bytes are not a model with webtween's inputs). `between` throws `frame-size` for a frame of
another size than the interpolator's.
