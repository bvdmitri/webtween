import { microseconds, type Microseconds, type Size, type Timing } from '@webtween/core';
import type { Ort } from '@webtween/onnx';

/**
 * What webtween does with a video frame: read its size, timing and pixels, make a frame from
 * pixels, and copy one with new timing.
 *
 * @remarks The browser binds these to `VideoFrame`; tests bind them to stand-in frames.
 */
export interface FrameOps {
  size(frame: VideoFrame): Size;
  timing(frame: VideoFrame): Timing;
  /** The visible pixels as RGBA bytes, row by row. */
  pixels(frame: VideoFrame): Promise<Uint8ClampedArray<ArrayBuffer>>;
  make(rgba: Uint8ClampedArray<ArrayBuffer>, size: Size, timestamp: Microseconds): VideoFrame;
  retime(frame: VideoFrame, timing: Timing): VideoFrame;
}

/**
 * What an interpolator needs from its environment: frames, the model runtime, whether there is
 * WebGPU, and
 * a way to fetch the model.
 *
 * @remarks {@link browserPlatform} is the browser's; a test supplies its own, which is how the
 * interpolator runs outside a browser.
 */
export interface Platform {
  readonly frames: FrameOps;
  /** onnxruntime-web, imported on the first call only. */
  importRuntime(): Promise<Ort>;
  /** Whether the browser has a WebGPU adapter, so the model can be tried on WebGPU. */
  hasWebGpu(): Promise<boolean>;
  fetch(url: string): Promise<Uint8Array<ArrayBuffer>>;
}

const RGBA = 4;

function visibleSize(frame: VideoFrame): Size {
  return {
    width: frame.visibleRect?.width ?? frame.codedWidth,
    height: frame.visibleRect?.height ?? frame.codedHeight,
  };
}

/** The browser's frames: `VideoFrame` read with `copyTo` as RGBA, made from RGBA bytes. */
export const browserFrames: FrameOps = {
  size: visibleSize,
  timing: (frame) => ({
    timestamp: microseconds(frame.timestamp),
    duration: microseconds(frame.duration ?? 0),
  }),
  pixels: async (frame) => {
    const { width, height } = visibleSize(frame);
    const rgba = new Uint8ClampedArray(width * height * RGBA);
    await frame.copyTo(rgba, { format: 'RGBA' });
    return rgba;
  },
  make: (rgba, size, timestamp) =>
    new VideoFrame(rgba, {
      format: 'RGBA',
      codedWidth: size.width,
      codedHeight: size.height,
      timestamp,
    }),
  retime: (frame, timing) => new VideoFrame(frame, timing),
};

/** The browser as a {@link Platform}: `VideoFrame`, WebGPU, `fetch`, and onnxruntime-web. */
export function browserPlatform(): Platform {
  return {
    frames: browserFrames,
    // The main entry, whose WebGPU backend (JSEP) computes RIFE as WASM does; the
    // `onnxruntime-web/webgpu` entry's native backend does not (ADR 0002).
    importRuntime: () => import('onnxruntime-web'),
    hasWebGpu: async (): Promise<boolean> => {
      const gpu = typeof navigator === 'object' && 'gpu' in navigator ? navigator.gpu : undefined;
      const adapter = await gpu?.requestAdapter();
      return adapter !== null && adapter !== undefined;
    },
    fetch: async (url): Promise<Uint8Array<ArrayBuffer>> => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`fetching ${url} gave ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
