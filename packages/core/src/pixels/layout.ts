/** A frame's size in whole pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The multiple the model needs each side to be (docs/MODEL.md): its coarsest flow block sees the
 * frame at 1/16 and halves it twice more.
 */
export const ALIGNMENT = 64;

const CHANNELS = 3;
const RGBA = 4;
const BYTE_MAX = 255;

/** `size` with each side rounded up to a multiple of `alignment`: the size the model runs at. */
export function paddedSize(size: Size, alignment = ALIGNMENT): Size {
  const { width, height } = size;
  if (!(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0)) {
    throw new RangeError(`size must be positive whole pixels, got ${width}x${height}`);
  }
  const up = (side: number): number => Math.ceil(side / alignment) * alignment;
  return { width: up(width), height: up(height) };
}

/**
 * RGBA bytes as the model's input: three planes (red, green, blue) of `padded` size, values in
 * 0..1, alpha dropped. The padding repeats the nearest edge pixel, so the network sees no false
 * border.
 *
 * @remarks The reference for the GPU packing shader, and the packing itself on the WASM backend.
 */
export function packPlanar(rgba: Uint8ClampedArray, size: Size, padded: Size): Float32Array {
  const expected = size.width * size.height * RGBA;
  if (rgba.length !== expected) {
    throw new RangeError(
      `expected ${expected} bytes of RGBA for ${size.width}x${size.height}, got ${rgba.length}`,
    );
  }
  const plane = padded.width * padded.height;
  const planar = new Float32Array(plane * CHANNELS);
  for (let y = 0; y < padded.height; y += 1) {
    const row = Math.min(y, size.height - 1) * size.width;
    for (let x = 0; x < padded.width; x += 1) {
      const source = (row + Math.min(x, size.width - 1)) * RGBA;
      for (let c = 0; c < CHANNELS; c += 1) {
        planar[c * plane + y * padded.width + x] = (rgba[source + c] ?? 0) / BYTE_MAX;
      }
    }
  }
  return planar;
}

/**
 * The model's output as RGBA bytes of `size`: the padding cropped, each value clamped to 0..1
 * and rounded to the nearest byte, alpha opaque.
 *
 * @remarks The reference for the GPU unpacking shader, and the unpacking itself on the WASM
 * backend.
 */
export function unpackPlanar(planar: Float32Array, size: Size, padded: Size): Uint8ClampedArray {
  const plane = padded.width * padded.height;
  const rgba = new Uint8ClampedArray(size.width * size.height * RGBA);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const target = (y * size.width + x) * RGBA;
      for (let c = 0; c < CHANNELS; c += 1) {
        const value = planar[c * plane + y * padded.width + x] ?? 0;
        rgba[target + c] = Math.round(Math.min(1, Math.max(0, value)) * BYTE_MAX);
      }
      rgba[target + CHANNELS] = BYTE_MAX;
    }
  }
  return rgba;
}
