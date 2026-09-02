---
name: DHD legacy asset serving
description: Constraints for serving the imported Vercel bundle inside the DHD artifact.
---

The imported Admin/Employee entry is a split Vite bundle, not a self-contained JavaScript file. The artifact must expose its vendor and route chunks, and any fallback asset middleware must prefer valid artifact-public files before backup copies and assign MIME types from file extensions.

**Why:** Omitting vendor chunks makes React fail before mounting and produces a blank `#root`. Serving a valid PNG as JavaScript breaks visible branding and can generate misleading browser errors.

**How to apply:** When the imported asset set is incomplete, serve or emit all referenced backup assets during development and build. Keep existing `public/assets` files authoritative, and map CSS, JS, images, fonts, and audio to their correct content types.