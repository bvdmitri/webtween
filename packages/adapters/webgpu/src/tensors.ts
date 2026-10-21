import type { Size } from '@webtween/core';

import { PACK, UNPACK, WORKGROUP } from './shaders';

/** A frame's size and the padded size the model runs at. */
export interface TensorSizes {
  readonly size: Size;
  readonly padded: Size;
}

/**
 * The shaders between frames and the model, for one frame size, encoded into a caller's command
 * encoder so packing, inference and unpacking stay on the GPU.
 *
 * @remarks `pack` reads an `rgba8unorm` texture of the frame size into a storage buffer of
 * `planarBytes`; `unpack` reads such a buffer into one of `rgbaBytes`, RGBA bytes row by row.
 */
export interface TensorPipelines {
  readonly planarBytes: number;
  readonly rgbaBytes: number;
  pack(encoder: GPUCommandEncoder, frame: GPUTexture, planar: GPUBuffer): void;
  unpack(encoder: GPUCommandEncoder, planar: GPUBuffer, rgba: GPUBuffer): void;
  destroy(): void;
}

const CHANNELS = 3;
const BYTES = 4;

function pipeline(device: GPUDevice, code: string): GPUComputePipeline {
  const module = device.createShaderModule({ code });
  return device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
}

/** One compute pass: a pipeline, its bindings, and the size of the image it covers. */
interface Pass {
  readonly work: GPUComputePipeline;
  readonly bind: GPUBindGroup;
  readonly over: Size;
}

function dispatch(encoder: GPUCommandEncoder, { work, bind, over }: Pass): void {
  const pass = encoder.beginComputePass();
  pass.setPipeline(work);
  pass.setBindGroup(0, bind);
  pass.dispatchWorkgroups(Math.ceil(over.width / WORKGROUP), Math.ceil(over.height / WORKGROUP));
  pass.end();
}

function uniform(device: GPUDevice, sizes: TensorSizes): GPUBuffer {
  const { size, padded } = sizes;
  const data = new Uint32Array([size.width, size.height, padded.width, padded.height]);
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

type Bind = (
  work: GPUComputePipeline,
  input: GPUBindingResource,
  output: GPUBuffer,
) => GPUBindGroup;

function binder(device: GPUDevice, sizesBuffer: GPUBuffer): Bind {
  return (work, input, output) =>
    device.createBindGroup({
      layout: work.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: sizesBuffer } },
        { binding: 1, resource: input },
        { binding: 2, resource: { buffer: output } },
      ],
    });
}

/** Build the packing and unpacking shaders for frames of one size on `device`. */
export function createTensorPipelines(device: GPUDevice, sizes: TensorSizes): TensorPipelines {
  const sizesBuffer = uniform(device, sizes);
  const [pack, unpack] = [pipeline(device, PACK), pipeline(device, UNPACK)];
  const bind = binder(device, sizesBuffer);
  return {
    planarBytes: CHANNELS * sizes.padded.width * sizes.padded.height * BYTES,
    rgbaBytes: sizes.size.width * sizes.size.height * BYTES,
    pack: (encoder, frame, planar): void => {
      const bound = bind(pack, frame.createView(), planar);
      dispatch(encoder, { work: pack, bind: bound, over: sizes.padded });
    },
    unpack: (encoder, planar, rgba): void => {
      const bound = bind(unpack, { buffer: planar }, rgba);
      dispatch(encoder, { work: unpack, bind: bound, over: sizes.size });
    },
    destroy: (): void => {
      sizesBuffer.destroy();
    },
  };
}
