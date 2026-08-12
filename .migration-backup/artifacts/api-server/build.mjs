import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';

const require = createRequire(import.meta.url);
globalThis.require = require;
globalThis.__filename = url.fileURLToPath(import.meta.url);
globalThis.__dirname = path.dirname(globalThis.__filename);

import * as esbuild from 'esbuild';
import pinoPlugin from 'esbuild-plugin-pino';
import fs from 'node:fs';

fs.mkdirSync('./dist', { recursive: true });

console.log('==> Building API Server for Render/Production using esbuild...');

try {
  await esbuild.build({
    entryPoints: { index: 'src/index.ts' },
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outdir: 'dist',
    outExtension: { '.js': '.mjs' },
    sourcemap: true,
    external: ['pg-native'],
    plugins: [
      pinoPlugin({
        transports: ['pino-pretty']
      })
    ],
    banner: {
      js: `
import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
      `.trim(),
    },
  });
  console.log('==> API Server build completed successfully -> dist/index.mjs');
} catch (error) {
  console.error('==> Build failed:', error);
  process.exit(1);
}
