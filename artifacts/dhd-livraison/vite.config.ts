import path from 'path';
import fs from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT ?? '5173';
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';
const importedStylesheetName = 'assets/index-BSGrDEhh.css';
const importedStylesheetPath = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '.migration-backup',
  'public',
  importedStylesheetName,
);

function importedStylesheetPlugin() {
  return {
    name: 'serve-imported-stylesheet',
    configureServer(server: { middlewares: { use: (path: string, handler: (req: unknown, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (content: Buffer) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use(`/${importedStylesheetName}`, (_request, response, next) => {
        if (!fs.existsSync(importedStylesheetPath)) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/css; charset=utf-8');
        response.end(fs.readFileSync(importedStylesheetPath));
      });
    },
    generateBundle(this: { emitFile: (asset: { type: 'asset'; fileName: string; source: Buffer }) => void }) {
      if (fs.existsSync(importedStylesheetPath)) {
        this.emitFile({
          type: 'asset',
          fileName: importedStylesheetName,
          source: fs.readFileSync(importedStylesheetPath),
        });
      }
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    importedStylesheetPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // The managed API artifact listens on 8080. Employee self-service
      // endpoints use the /api prefix, so static /employee-login.html remains
      // a frontend asset instead of being captured by the proxy.
      '/api': 'http://localhost:8080',
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
