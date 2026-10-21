// The two compute shaders between a frame and the model. Both read the frame size and the padded
// size from one uniform, and run one invocation per pixel in 8 by 8 workgroups.

/** Invocations per workgroup side. */
export const WORKGROUP = 8;

const SIZES = /* wgsl */ `
struct Sizes {
  size: vec2u,
  padded: vec2u,
}
@group(0) @binding(0) var<uniform> sizes: Sizes;
`;

/**
 * RGBA texture to the model's planar input: red, green and blue planes of the padded size, values
 * in 0..1, the padding repeating the nearest edge pixel (as `packPlanar`).
 */
export const PACK = /* wgsl */ `${SIZES}
@group(0) @binding(1) var frame: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> planar: array<f32>;

@compute @workgroup_size(${WORKGROUP}, ${WORKGROUP})
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= sizes.padded.x || id.y >= sizes.padded.y) { return; }
  let texel = textureLoad(frame, min(id.xy, sizes.size - 1u), 0);
  let plane = sizes.padded.x * sizes.padded.y;
  let at = id.y * sizes.padded.x + id.x;
  planar[at] = texel.r;
  planar[plane + at] = texel.g;
  planar[2u * plane + at] = texel.b;
}
`;

/**
 * The model's planar output to RGBA bytes of the frame size, one u32 per pixel: the padding
 * cropped, each value clamped to 0..1 and rounded half up to a byte, alpha opaque (as
 * `unpackPlanar`).
 */
export const UNPACK = /* wgsl */ `${SIZES}
@group(0) @binding(1) var<storage, read> planar: array<f32>;
@group(0) @binding(2) var<storage, read_write> rgba: array<u32>;

fn byte(value: f32) -> u32 {
  return u32(floor(clamp(value, 0.0, 1.0) * 255.0 + 0.5));
}

@compute @workgroup_size(${WORKGROUP}, ${WORKGROUP})
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= sizes.size.x || id.y >= sizes.size.y) { return; }
  let plane = sizes.padded.x * sizes.padded.y;
  let at = id.y * sizes.padded.x + id.x;
  let r = byte(planar[at]);
  let g = byte(planar[plane + at]);
  let b = byte(planar[2u * plane + at]);
  rgba[id.y * sizes.size.x + id.x] = r | (g << 8u) | (b << 16u) | (255u << 24u);
}
`;
