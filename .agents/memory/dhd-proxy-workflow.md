---
name: DHD proxy workflow
description: Port and proxy alignment for the DHD API and frontend workflows.
---

The DHD frontend reaches the managed API through the artifact proxy, so the API workflow port and the artifact proxy configuration must stay aligned. The API itself already reads `PORT`; changing only the process command is sufficient.

**Why:** A healthy API on an unconfigured port still appears broken in the preview: health checks fail through the proxy and authenticated pages can render as empty or fail to load data.

**How to apply:** When changing workflows or rebuilding the artifact, verify the API listener, proxy target, and frontend `/api` proxy together, then test through the proxied URL rather than only localhost.