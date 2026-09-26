---
name: DHD Vite entry file
description: The non-obvious HTML entry used by the DHD frontend workflow.
---

Runtime compatibility scripts and styles must be linked from the `index.html` at the DHD artifact root. Do not assume that the similarly named file under `public/` is the active Vite entry.

The imported application bundle remains the active router for both administrator and employee accounts. A route in editable React source is not necessarily present in that bundle. Do not insert controls inside the bundle's React-owned root from a compatibility script.

**Why:** The frontend workflow serves Vite from the artifact root. Changes linked only from `public/index.html`, or to unused React source, can appear correct in the workspace but never load in the running application. Injecting nodes among React-owned children can break its reconciliation and leave dialogs unresponsive.

**How to apply:** Verify the served HTML, downloaded asset, and actual route table before relying on a source change. For a compatibility extension, use delegated events or mount standalone controls outside React's root; if adding a new route, wire the entry and production fallback intentionally.