// The demo's worker: decodes the picked clip with Mediabunny, slows it down with webtween, and
// encodes the result as an H.264 MP4 in memory. Audio is left out.
import { browserFrames, createInterpolator, slowDown, type Interpolator } from '@bvdmitri/webtween';
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
  type InputVideoTrack,
} from 'mediabunny';

import type { SlowProgress, SlowRequest, SlowResult } from './protocol';

const MODEL = '/models/rife-4.25-fp32.onnx';
const WASM = '/ort/';

function post(message: SlowResult, transfer: Transferable[] = []): void {
  (globalThis as unknown as Worker).postMessage(message, transfer);
}

/** Counts kept while a clip is slowed, sent to the page as progress. */
interface Tally {
  readonly started: number;
  readonly totalFrames: number;
  backend: string;
  sourceFrames: number;
  outputFrames: number;
  generatedFrames: number;
  generateMs: number;
}

function progress(tally: Tally): SlowProgress {
  const { started, ...counts } = tally;
  return { type: 'progress', ...counts, elapsedMs: performance.now() - started };
}

async function* decoded(track: InputVideoTrack): AsyncGenerator<VideoFrame> {
  const samples = new VideoSampleSink(track).samples();
  for await (const sample of samples) {
    yield sample.toVideoFrame();
    sample.close();
  }
}

/** The interpolator, sized by the clip's first frame, with its generating time tallied. */
async function interpolatorFor(
  first: VideoFrame,
  request: SlowRequest,
  tally: Tally,
): Promise<Interpolator> {
  const options = { model: MODEL, wasmPaths: WASM, backend: request.backend };
  const interpolator = await createInterpolator({ ...options, ...browserFrames.size(first) });
  tally.backend = interpolator.backend;
  return {
    ...interpolator,
    backend: interpolator.backend,
    between: async (a, b, t): Promise<VideoFrame> => {
      const start = performance.now();
      const frame = await interpolator.between(a, b, t);
      tally.generateMs += performance.now() - start;
      tally.generatedFrames += 1;
      return frame;
    },
  };
}

async function encode(
  frames: AsyncIterable<VideoFrame>,
  frameRate: number,
  tally: Tally,
): Promise<ArrayBuffer> {
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const video = new VideoSampleSource({ codec: 'avc', bitrate: new Quality('high') });
  output.addVideoTrack(video, { frameRate });
  await output.start();
  for await (const frame of frames) {
    const sample = new VideoSample(frame);
    await video.add(sample);
    sample.close();
    frame.close();
    tally.outputFrames += 1;
  }
  await output.finalize();
  if (output.target.buffer === null) throw new Error('the encoder wrote nothing');
  return output.target.buffer;
}

async function videoTrack(file: File): Promise<InputVideoTrack> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const track = await input.getPrimaryVideoTrack();
  if (track === null) throw new Error('the clip has no video');
  return track;
}

async function slow(request: SlowRequest): Promise<void> {
  const started = performance.now();
  const track = await videoTrack(request.file);
  const stats = await track.computePacketStats();
  const tally: Tally = {
    started,
    totalFrames: stats.packetCount,
    backend: '',
    sourceFrames: 0,
    outputFrames: 0,
    generatedFrames: 0,
    generateMs: 0,
  };
  const frames = decoded(track);
  const first = await frames.next();
  if (first.done === true) throw new Error('the clip has no frames');
  const interpolator = await interpolatorFor(first.value, request, tally);
  const slowed = slowDown(prepend(first.value, frames), {
    interpolator,
    factor: request.factor,
    ...(request.range && { range: request.range }),
    onProgress: (done) => {
      tally.sourceFrames = done;
      post(progress(tally));
    },
  });
  const mp4 = await encode(slowed, stats.averagePacketRate, tally);
  await interpolator.destroy();
  post({ type: 'done', mp4, elapsedMs: performance.now() - started }, [mp4]);
}

async function* prepend(
  first: VideoFrame,
  rest: AsyncIterable<VideoFrame>,
): AsyncGenerator<VideoFrame> {
  yield first;
  yield* rest;
}

globalThis.addEventListener('message', (event: MessageEvent<SlowRequest>) => {
  void (async (): Promise<void> => {
    try {
      await slow(event.data);
    } catch (error) {
      post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  })();
});
