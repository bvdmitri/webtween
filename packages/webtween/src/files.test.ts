import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { defaultModel, MODEL_FILE, ONNXRUNTIME_WEB_VERSION } from './files';

describe('the shipped files', () => {
  it('name the runtime version the package depends on', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies['onnxruntime-web']).toBe(ONNXRUNTIME_WEB_VERSION);
  });

  it('find the model in the package models folder by default', () => {
    expect(defaultModel().pathname.endsWith(`/packages/webtween/models/${MODEL_FILE}`)).toBe(true);
  });
});
