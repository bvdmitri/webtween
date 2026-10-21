import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ALIGNMENT, packPlanar, paddedSize, unpackPlanar } from './layout';

const rgba = (...pixels: number[][]): Uint8ClampedArray => new Uint8ClampedArray(pixels.flat());

describe('paddedSize', () => {
  it('rounds each side up to the model alignment', () => {
    expect(ALIGNMENT).toBe(64);
    expect(paddedSize({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1088 });
    expect(paddedSize({ width: 64, height: 1 })).toEqual({ width: 64, height: 64 });
    expect(paddedSize({ width: 5, height: 7 }, 4)).toEqual({ width: 8, height: 8 });
  });

  it('refuses a size that is not a positive whole number', () => {
    expect(() => paddedSize({ width: 0, height: 4 })).toThrow(
      'size must be positive whole pixels, got 0x4',
    );
    expect(() => paddedSize({ width: 2.5, height: 4 })).toThrow(RangeError);
  });
});

describe('packPlanar', () => {
  it('lays RGBA out as three planes in 0..1, repeating the edge into the padding', () => {
    const image = rgba([255, 0, 0, 9], [0, 255, 51, 9]);
    const planar = packPlanar(image, { width: 2, height: 1 }, { width: 3, height: 2 });
    // prettier-ignore
    expect(planar).toEqual(new Float32Array([
      1, 0, 0,  1, 0, 0,
      0, 1, 1,  0, 1, 1,
      0, 0.2, 0.2,  0, 0.2, 0.2,
    ]));
  });

  it('refuses pixels that do not match the size', () => {
    expect(() =>
      packPlanar(rgba([1, 2, 3, 4]), { width: 2, height: 1 }, { width: 2, height: 1 }),
    ).toThrow('expected 8 bytes of RGBA for 2x1, got 4');
  });
});

describe('unpackPlanar', () => {
  it('crops the padding, clamps to 0..1 and rounds to bytes with opaque alpha', () => {
    // prettier-ignore
    const planar = new Float32Array([
      1.2, 0.5, 7,  7, 7, 7,
      -0.1, 0.002, 7,  7, 7, 7,
      0.2, 0.998, 7,  7, 7, 7,
    ]);
    const out = unpackPlanar(planar, { width: 2, height: 1 }, { width: 3, height: 2 });
    expect([...out]).toEqual([255, 0, 51, 255, 128, 1, 254, 255]);
  });

  it('undoes packPlanar for every image', () => {
    const sizes = fc.record({
      width: fc.integer({ min: 1, max: 9 }),
      height: fc.integer({ min: 1, max: 9 }),
    });
    const image = sizes.chain((size) =>
      fc
        .uint8Array({
          minLength: size.width * size.height * 4,
          maxLength: size.width * size.height * 4,
        })
        .map((bytes) => ({ size, bytes })),
    );
    fc.assert(
      fc.property(image, ({ size, bytes }) => {
        const opaque = new Uint8ClampedArray(
          bytes.map((value, index) => (index % 4 === 3 ? 255 : value)),
        );
        const padded = paddedSize(size, 8);
        expect(unpackPlanar(packPlanar(opaque, size, padded), size, padded)).toEqual(opaque);
      }),
    );
  });
});
