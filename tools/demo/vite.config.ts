// The demo page: the library from its source, the model from the repository's models/ folder
// (built by tools/export) and onnxruntime-web's WebAssembly from its package, both served as is.
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SERVED: Record<string, string> = {
  '/models/': path.join(ROOT, 'models'),
  // The copy the library itself imports, so the WebAssembly matches its JavaScript.
  '/ort/': path.join(ROOT, 'packages/webtween/node_modules/onnxruntime-web/dist'),
};
const TYPES: Record<string, string> = {
  '.onnx': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.mjs': 'text/javascript',
};

// Serves the files under each prefix in SERVED, unchanged.
function serveFolders(): Plugin {
  return {
    name: 'serve-folders',
    configureServer: (server: ViteDevServer): void => {
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '').split('?', 1)[0] ?? '';
        const prefix = Object.keys(SERVED).find((key) => url.startsWith(key));
        const file =
          prefix === undefined
            ? undefined
            : path.join(SERVED[prefix] ?? '', url.slice(prefix.length));
        if (file === undefined || !existsSync(file)) {
          next();
          return;
        }
        response.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(response);
      });
    },
  };
}

export default defineConfig({
  plugins: [serveFolders()],
  resolve: {
    alias: { '@bvdmitri/webtween': path.join(ROOT, 'packages/webtween/src/index.ts') },
  },
  // onnxruntime-web finds its WebAssembly through wasmPaths, not through the bundler.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  worker: { format: 'es' },
});
