import type { Size } from '@webtween/core';
import type * as OrtModule from 'onnxruntime-web';

/** The onnxruntime-web module, passed in so the browser loads it only when a session is opened. */
export type Ort = typeof OrtModule;

/** Where the model runs: on the GPU through WebGPU, or on the CPU through WebAssembly. */
export type Backend = 'webgpu' | 'wasm';

/** One run's inputs: two frames as planar images of `size` (padded), and the time between them. */
export interface ModelFrames<T> {
  readonly img0: T;
  readonly img1: T;
  readonly t: number;
  readonly size: Size;
}

/** The model's output left on the GPU; `dispose` frees it once read. */
export interface GpuOutput {
  readonly buffer: GPUBuffer;
  dispose(): void;
}

/**
 * An open interpolation model. `runOnCpu` takes and gives planar float arrays (any backend);
 * `runOnGpu` takes and gives GPU buffers on the WebGPU backend's device, with no copy to the CPU.
 */
export interface ModelSession {
  readonly backend: Backend;
  runOnCpu(frames: ModelFrames<Float32Array>): Promise<Float32Array>;
  runOnGpu(frames: ModelFrames<GPUBuffer>): Promise<GpuOutput>;
  release(): Promise<void>;
}

/** A model whose inputs or outputs are not webtween's model contract (docs/MODEL.md). */
export class ModelContractError extends Error {
  public override readonly name = 'ModelContractError';
}

const INPUTS = ['img0', 'img1', 'timestep'] as const;
const OUTPUT = 'output';
const CHANNELS = 3;

function checkContract(session: OrtModule.InferenceSession): void {
  const isContract =
    INPUTS.every((name) => session.inputNames.includes(name)) &&
    session.outputNames.includes(OUTPUT);
  if (isContract) return;
  const has = `${session.inputNames.join(', ')} and gives ${session.outputNames.join(', ')}`;
  throw new ModelContractError(
    `the model takes ${has}; webtween needs ${INPUTS.join(', ')} and ${OUTPUT}`,
  );
}

const dimensions = (size: Size): number[] => [1, CHANNELS, size.height, size.width];

function feeds<T>(
  ort: Ort,
  frames: ModelFrames<T>,
  tensor: (image: T) => OrtModule.Tensor,
): Record<string, OrtModule.Tensor> {
  const timestep = new ort.Tensor('float32', new Float32Array([frames.t]), [1]);
  return { img0: tensor(frames.img0), img1: tensor(frames.img1), timestep };
}

async function runOnCpu(
  ort: Ort,
  session: OrtModule.InferenceSession,
  frames: ModelFrames<Float32Array>,
): Promise<Float32Array> {
  const cpu = (data: Float32Array): OrtModule.Tensor =>
    new ort.Tensor('float32', data, dimensions(frames.size));
  const result = await session.run(feeds(ort, frames, cpu));
  return (await result[OUTPUT]?.getData()) as Float32Array;
}

async function runOnGpu(
  ort: Ort,
  session: OrtModule.InferenceSession,
  frames: ModelFrames<GPUBuffer>,
): Promise<GpuOutput> {
  const options = { dataType: 'float32' as const, dims: dimensions(frames.size) };
  const gpu = (buffer: GPUBuffer): OrtModule.Tensor => ort.Tensor.fromGpuBuffer(buffer, options);
  const results = await session.run(feeds(ort, frames, gpu));
  const output = results[OUTPUT];
  if (output === undefined) throw new ModelContractError('the model gave no output');
  return {
    buffer: output.gpuBuffer,
    dispose: (): void => {
      output.dispose();
    },
  };
}

/**
 * Open the model in `bytes` on `backend`, checking it has the model contract's inputs and output.
 *
 * @remarks On WebGPU the outputs stay on the GPU. A caller that wants its own device used (to
 * share buffers with its shaders) sets `ort.env.webgpu.device` before the first session opens.
 */
export async function openSession(
  ort: Ort,
  bytes: Uint8Array,
  backend: Backend,
): Promise<ModelSession> {
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: [backend],
    preferredOutputLocation: backend === 'webgpu' ? 'gpu-buffer' : 'cpu',
    graphOptimizationLevel: 'all',
  });
  checkContract(session);
  return {
    backend,
    runOnCpu: (frames): Promise<Float32Array> => runOnCpu(ort, session, frames),
    runOnGpu: (frames): Promise<GpuOutput> => runOnGpu(ort, session, frames),
    release: (): Promise<void> => session.release(),
  };
}
