/**
 * Copy `bytes` from the start of a GPU buffer (with `COPY_SRC` usage) to the CPU.
 *
 * @remarks Waits for the GPU work already submitted; the staging buffer is freed before returning.
 */
export async function readBuffer(
  device: GPUDevice,
  source: GPUBuffer,
  bytes: number,
): Promise<ArrayBuffer> {
  const staging = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(source, 0, staging, 0, bytes);
  device.queue.submit([encoder.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const copy = new ArrayBuffer(bytes);
  new Uint8Array(copy).set(new Uint8Array(staging.getMappedRange()));
  staging.destroy();
  return copy;
}
