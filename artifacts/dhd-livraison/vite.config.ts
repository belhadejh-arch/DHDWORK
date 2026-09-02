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
const importedAssetsPath = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '.migration-backup',
  'public',
  'assets',
);

function importedStylesheetPlugin() {
  return {
    name: 'serve-imported-stylesheet',
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            request: { url?: string },
            response: {
              statusCode: number;
              setHeader: (name: string, value: string) => void;
              end: (content: Buffer) => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use((request, response, next) => {
        const requestedPath = request.url?.split('?')[0] ?? '';
        if (!requestedPath.startsWith('/assets/')) {
          next();
          return;
        }

        const requestedName = decodeURIComponent(
          requestedPath.slice('/assets/'.length),
        );
        const publicAssetPath = path.resolve(
          import.meta.dirname,
          'public',
          'assets',
          requestedName,
        );
        if (
          publicAssetPath.startsWith(
            `${path.resolve(import.meta.dirname, 'public', 'assets')}${path.sep}`,
          ) &&
          fs.existsSync(publicAssetPath) &&
          fs.statSync(publicAssetPath).isFile()
        ) {
          next();
          return;
        }

        const assetPath = path.resolve(importedAssetsPath, requestedName);
        if (
          !assetPath.startsWith(`${importedAssetsPath}${path.sep}`) ||
          !fs.existsSync(assetPath) ||
          !fs.statSync(assetPath).isFile()
        ) {
          next();
          return;
        }

        response.statusCode = 200;
        const extension = path.extname(requestedName).toLowerCase();
        const contentTypes: Record<string, string> = {
          '.css': 'text/css; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.mjs': 'text/javascript; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.mp3': 'audio/mpeg',
        };
        response.setHeader(
          'Content-Type',
          contentTypes[extension] ?? 'application/octet-stream',
        );
        response.end(fs.readFileSync(assetPath));
      });
    },
    generateBundle(this: { emitFile: (asset: { type: 'asset'; fileName: string; source: Buffer }) => void }) {
      if (!fs.existsSync(importedAssetsPath)) {
        return;
      }

      for (const fileName of fs.readdirSync(importedAssetsPath)) {
        const sourcePath = path.join(importedAssetsPath, fileName);
        const publicPath = path.resolve(
          import.meta.dirname,
          'public',
          'assets',
          fileName,
        );
        if (!fs.statSync(sourcePath).isFile() || fs.existsSync(publicPath)) {
          continue;
        }
        this.emitFile({
          type: 'asset',
          fileName: `assets/${fileName}`,
          source: fs.readFileSync(sourcePath),
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
