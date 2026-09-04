---
name: DHD Vite entry file
description: The non-obvious HTML entry used by the DHD frontend workflow.
---

Runtime compatibility scripts and styles must be linked from the `index.html` at the DHD artifact root. Do not assume that the similarly named file under `public/` is the active Vite entry.

**Why:** The frontend workflow serves Vite from the artifact root. Changes linked only from `public/index.html` can appear correct in the workspace but never load in the running application.

**How to apply:** When adding a global admin extension or fixing an imported bundle, verify the served HTML and downloaded asset with direct requests to the running frontend; source changes alone may not affect the shipped bundle.