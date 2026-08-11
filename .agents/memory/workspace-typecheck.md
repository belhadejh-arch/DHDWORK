---
name: Workspace typecheck order
description: The monorepo's generated workspace declarations must be built before package-level TypeScript checks.
---

Build the referenced workspace packages before running application `typecheck`; otherwise TypeScript reports stale or missing `dist/*.d.ts` errors that obscure the actual source issues.

**Why:** Project references use emitted declaration files, while the application build can still resolve source modules through Vite.

**How to apply:** Build the relevant `lib/*` packages first, then run the API and web package typechecks.