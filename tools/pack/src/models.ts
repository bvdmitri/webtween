import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface Manifest {
  readonly models: readonly { readonly file: string; readonly sha256: string }[];
}

const MANIFEST = 'manifest.json';

function manifestOf(source: string): Manifest {
  const file = path.join(source, MANIFEST);
  if (!existsSync(file)) {
    throw new Error('no models/manifest.json: run `uv run webtween-export build` in tools/export');
  }
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest;
}

/**
 * Copy the exported models (`source`, the repository's `models/`) and their manifest into
 * `target` (the package's `models/`), checking each model's SHA-256 against the manifest first, so
 * the published package holds exactly the model its manifest names. Returns the files copied.
 */
export function copyModels(source: string, target: string): string[] {
  const manifest = manifestOf(source);
  for (const { file, sha256 } of manifest.models) {
    const digest = createHash('sha256')
      .update(readFileSync(path.join(source, file)))
      .digest('hex');
    if (digest !== sha256) {
      throw new Error(`${file} has SHA-256 ${digest}, the manifest says ${sha256}`);
    }
  }
  mkdirSync(target, { recursive: true });
  for (const { file } of manifest.models)
    copyFileSync(path.join(source, file), path.join(target, file));
  copyFileSync(path.join(source, MANIFEST), path.join(target, MANIFEST));
  return manifest.models.map((model) => model.file);
}
