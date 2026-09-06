---
name: Workspace typecheck prerequisites
description: The monorepo service typecheck depends on declaration outputs from imported workspace libraries.
---

Run the declaration-only TypeScript builds for the imported workspace libraries before typechecking a service that references them.

**Why:** The service compiler reports missing composite declaration outputs even when the service source itself is valid.

**How to apply:** When validating a service after installation or a clean checkout, build the referenced library tsconfigs first, then run the service typecheck.