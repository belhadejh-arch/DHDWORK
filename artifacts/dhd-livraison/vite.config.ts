import fs from 'node:fs';
import path from 'path';
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
const legacyPublicDir = path.resolve(import.meta.dirname, '..', '..', '.migration-backup', 'public');

function legacyPublicAssets() {
  return {
    name: 'dhd-legacy-public-assets',
    configureServer(server: { middlewares: { use: (handler: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((request, response, next) => {
        const requestPath = request.url?.split('?')[0] ?? '/';
        let decodedPath = requestPath;
        try {
          decodedPath = decodeURIComponent(requestPath);
        } catch {
          next();
          return;
        }
        const candidate = path.resolve(legacyPublicDir, `.${decodedPath}`);
        if (!candidate.startsWith(`${legacyPublicDir}${path.sep}`) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
          next();
          return;
        }
        const extension = path.extname(candidate).toLowerCase();
        const contentTypes: Record<string, string> = {
          '.css': 'text/css; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.webmanifest': 'application/manifest+json',
          '.mp3': 'audio/mpeg',
        };
        response.setHeader('Content-Type', contentTypes[extension] ?? 'application/octet-stream');
        response.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(candidate).pipe(response);
      });
    },
    closeBundle() {
      const outputDir = path.resolve(import.meta.dirname, 'dist/public');
      const legacyAssetsDir = path.join(legacyPublicDir, 'assets');
      if (!fs.existsSync(legacyAssetsDir)) return;

      fs.mkdirSync(path.join(outputDir, 'assets'), { recursive: true });
      for (const fileName of fs.readdirSync(legacyAssetsDir)) {
        const source = path.join(legacyAssetsDir, fileName);
        const destination = path.join(outputDir, 'assets', fileName);
        if (!fs.statSync(source).isFile() || fs.existsSync(destination)) continue;
        fs.copyFileSync(source, destination);
      }
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    legacyPublicAssets(),
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
