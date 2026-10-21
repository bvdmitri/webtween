import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { copyModels } from './models';

function exported(bytes: Buffer, sha256?: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'models-'));
  writeFileSync(path.join(directory, 'rife.onnx'), bytes);
  const hash = sha256 ?? createHash('sha256').update(bytes).digest('hex');
  const manifest = {
    models: [{ file: 'rife.onnx', precision: 'fp32', bytes: bytes.length, sha256: hash }],
  };
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  return directory;
}

describe('copyModels', () => {
  it('copies every model of the manifest, and the manifest, once each checks out', () => {
    const source = exported(Buffer.from('model bytes'));
    const target = mkdtempSync(path.join(tmpdir(), 'package-'));
    expect(copyModels(source, target)).toEqual(['rife.onnx']);
    expect(readFileSync(path.join(target, 'rife.onnx'), 'utf8')).toBe('model bytes');
    const manifest = readFileSync(path.join(target, 'manifest.json'), 'utf8');
    expect(JSON.parse(manifest)).toMatchObject({
      models: [{ file: 'rife.onnx' }],
    });
  });

  it('refuses a model whose hash is not the manifest one', () => {
    const source = exported(Buffer.from('model bytes'), 'f'.repeat(64));
    const target = mkdtempSync(path.join(tmpdir(), 'package-'));
    expect(() => copyModels(source, target)).toThrow(
      /rife\.onnx has SHA-256 [0-9a-f]{64}, the manifest says f{64}/u,
    );
  });

  it('says how to build the models when they are missing', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'none-'));
    expect(() => copyModels(empty, empty)).toThrow(
      'no models/manifest.json: run `uv run webtween-export build` in tools/export',
    );
  });
});
