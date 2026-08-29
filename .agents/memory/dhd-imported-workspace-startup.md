---
name: DHD imported workspace startup
description: Startup checks for a freshly imported DHD pnpm workspace.
---

For a freshly imported workspace, install dependencies from the committed pnpm lockfile before diagnosing a blank preview, then confirm the artifact-root HTML points to the current Vite source entry rather than a stale generated bundle.

**Why:** An import can have the workspace manifests and lockfile present while `node_modules` is absent; a stale static entry can also let a superficial HTML check pass while the real React source is never built.

**How to apply:** Run the frozen workspace install, start both frontend and API workflows, check the frontend response and `/healthz`, and run the frontend production build before investigating application-level rendering bugs.