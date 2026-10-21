import { packPlanar, unpackPlanar } from '@webtween/core';
import type { ModelSession } from '@webtween/onnx';
import {
  createTensorPipelines,
  readBuffer,
  type TensorPipelines,
  type TensorSizes,
} from '@webtween/webgpu';

import type { FrameOps } from './platform';

/** Two consecutive frames, by identity: a pair asked for again reuses its packed input. */
export type Pair = readonly [VideoFrame, VideoFrame];

/** Makes the RGBA pixels of the frame at `t` between a pair, on one backend. */
export interface Engine {
  generate(pair: Pair, t: number): Promise<Uint8ClampedArray<ArrayBuffer>>;
  destroy(): void;
}

const RGBA = 4;

const isSame = (a: Pair | undefined, b: Pair): boolean => a?.[0] === b[0] && a[1] === b[1];

/** An {@link Engine} on the CPU: frames packed and unpacked by the core, the model on WASM. */
export function cpuEngine(session: ModelSession, sizes: TensorSizes, frames: FrameOps): Engine {
  let held: { pair: Pair; planes: readonly [Float32Array, Float32Array] } | undefined;
  const pack = async (frame: VideoFrame): Promise<Float32Array> =>
    packPlanar(await frames.pixels(frame), sizes.size, sizes.padded);
  return {
    generate: async (pair, t): Promise<Uint8ClampedArray<ArrayBuffer>> => {
      if (held === undefined || !isSame(held.pair, pair)) {
        held = { pair, planes: [await pack(pair[0]), await pack(pair[1])] };
      }
      const [img0, img1] = held.planes;
      const out = await session.runOnCpu({ img0, img1, t, size: sizes.padded });
      return unpackPlanar(out, sizes.size, sizes.padded) as Uint8ClampedArray<ArrayBuffer>;
    },
    destroy: (): void => {
      held = undefined;
    },
  };
}

/** The model open on WebGPU and the device it runs on, which the shaders share. */
export interface GpuModel {
  readonly session: ModelSession;
  readonly device: GPUDevice;
}

interface GpuResources {
  readonly device: GPUDevice;
  readonly sizes: TensorSizes;
  readonly frames: FrameOps;
  readonly pipelines: TensorPipelines;
  readonly planes: readonly [GPUBuffer, GPUBuffer];
  readonly textures: readonly [GPUTexture, GPUTexture];
  readonly rgba: GPUBuffer;
}

function gpuResources(device: GPUDevice, sizes: TensorSizes, frames: FrameOps): GpuResources {
  // Read here, not at import: a browser without WebGPU has no GPUBufferUsage.
  const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const pipelines = createTensorPipelines(device, sizes);
  const plane = (): GPUBuffer =>
    device.createBuffer({ size: pipelines.planarBytes, usage: storage });
  const texture = (): GPUTexture =>
    device.createTexture({
      size: sizes.size,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  const rgba = device.createBuffer({ size: pipelines.rgbaBytes, usage: storage });
  return {
    device,
    sizes,
    frames,
    pipelines,
    planes: [plane(), plane()],
    textures: [texture(), texture()],
    rgba,
  };
}

// Each frame of a pair written to its texture and packed into the model's input planes.
async function upload(resources: GpuResources, pair: Pair): Promise<void> {
  const { device, sizes, frames, pipelines, planes, textures } = resources;
  const { size } = sizes;
  const encoder = device.createCommandEncoder();
  for (const index of [0, 1] as const) {
    const pixels = await frames.pixels(pair[index]);
    device.queue.writeTexture(
      { texture: textures[index] },
      pixels,
      { bytesPerRow: size.width * RGBA },
      size,
    );
    pipelines.pack(encoder, textures[index], planes[index]);
  }
  device.queue.submit([encoder.finish()]);
}

async function infer(resources: GpuResources, model: GpuModel, t: number): Promise<ArrayBuffer> {
  const { device, sizes, pipelines, planes, rgba } = resources;
  const [img0, img1] = planes;
  const out = await model.session.runOnGpu({ img0, img1, t, size: sizes.padded });
  const encoder = device.createCommandEncoder();
  pipelines.unpack(encoder, out.buffer, rgba);
  device.queue.submit([encoder.finish()]);
  const bytes = await readBuffer(device, rgba, pipelines.rgbaBytes);
  out.dispose();
  return bytes;
}

/**
 * An {@link Engine} on the GPU: each frame's pixels written to a texture once per pair, then
 * packing, the model and unpacking on the device, and the result read back once.
 */
export function gpuEngine(model: GpuModel, sizes: TensorSizes, frames: FrameOps): Engine {
  const resources = gpuResources(model.device, sizes, frames);
  let held: Pair | undefined;
  return {
    generate: async (pair, t): Promise<Uint8ClampedArray<ArrayBuffer>> => {
      if (!isSame(held, pair)) await upload(resources, pair);
      held = pair;
      return new Uint8ClampedArray(await infer(resources, model, t));
    },
    destroy: (): void => {
      for (const resource of [...resources.planes, ...resources.textures, resources.rgba]) {
        resource.destroy();
      }
      resources.pipelines.destroy();
      held = undefined;
    },
  };
}
