import { existsSync, readFileSync } from 'node:fs';

import * as ort from 'onnxruntime-web';
import { describe, expect, it } from 'vitest';

import { openSession } from './session';

// The exported RIFE (docs/MODEL.md), present after `webtween-export build`; never committed.
const MODEL = new URL('../../../../models/rife-4.25-fp32.onnx', import.meta.url);
const SIZE = { width: 128, height: 64 };

/** A smooth pattern moved `shift` pixels right, as planar RGB in 0..1. */
function pattern(shift: number): Float32Array {
  const plane = SIZE.width * SIZE.height;
  const out = new Float32Array(plane * 3);
  for (let y = 0; y < SIZE.height; y += 1) {
    for (let x = 0; x < SIZE.width; x += 1) {
      const u = x - shift;
      const at = y * SIZE.width + x;
      out[at] = 0.5 + 0.4 * Math.sin(u / 9 + y / 13);
      out[plane + at] = 0.5 + 0.4 * Math.cos(u / 17 - y / 7);
      out[2 * plane + at] = 0.5 + 0.4 * Math.sin((u + y) / 11);
    }
  }
  return out;
}

describe.runIf(existsSync(MODEL))('the exported RIFE on onnxruntime-web', () => {
  it('generates the frame a moving pattern shows halfway', async () => {
    const session = await openSession(ort, new Uint8Array(readFileSync(MODEL)), 'wasm');
    const out = await session.runOnCpu({ img0: pattern(0), img1: pattern(4), t: 0.5, size: SIZE });
    const truth = pattern(2);
    let error = 0;
    let count = 0;
    for (const [index, element] of out.entries()) {
      const x = index % SIZE.width;
      if (x < 8 || x >= SIZE.width - 8) continue;
      error += Math.abs(element - (truth[index] ?? 0));
      count += 1;
    }
    expect(error / count).toBeLessThan(0.01);
    await session.release();
  }, 60_000);
});
