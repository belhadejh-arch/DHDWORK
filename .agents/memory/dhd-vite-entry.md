---
name: DHD Vite entry file
description: The non-obvious HTML entry used by the DHD frontend workflow.
---

Runtime compatibility scripts and styles must be linked from the `index.html` at the DHD artifact root. Do not assume that the similarly named file under `public/` is the active Vite entry.

**Why:** The frontend workflow serves Vite from the artifact root. Changes linked only from `public/index.html` can appear correct in the workspace but never load in the running application.

**How to apply:** When adding a global admin extension, verify the served HTML with a direct request to the running frontend and ensure its script/style tags are present before testing the feature.