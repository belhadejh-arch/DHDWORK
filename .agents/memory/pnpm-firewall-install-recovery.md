---
name: pnpm install recovery after firewall blocks
description: Recover a pnpm workspace after Replit's package firewall blocks a transitive package download.
---

If a frozen install stops on a firewall-blocked transitive dependency, updating the direct dependency to a compatible latest release may resolve the block. The failed install may have populated the package store without linking dependencies for all workspaces.

**Why:** After updating Express to pull a newer `proxy-addr`, the first restart still failed because the workspace links had not been completed; a second full install completed linking.

**How to apply:** After resolving the blocked package version, rerun `pnpm install --frozen-lockfile` for the entire workspace before restarting artifact-owned workflows.
