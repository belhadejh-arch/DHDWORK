---
name: Announcement schema compatibility
description: Historical PostgreSQL announcement tables use level/target_all and required timing/recipient metadata.
---

The announcement tables in this project can exist with a historical schema that differs from a newer Drizzle model. The compatible storage contract uses `level` and `target_all`, requires `starts_at`, `ends_at`, and announcement `created_at`/`updated_at`, and requires recipient `created_at` plus `is_read`; recipient rows do not necessarily have a composite uniqueness constraint.

**Why:** A publish request previously inserted newer column names and omitted required recipient metadata, causing every announcement publish to fail with HTTP 500 even though the tables existed.

**How to apply:** Before changing announcement persistence or running schema sync, inspect the live development table columns and keep the API mapping (`severity`/`audience`) separate from the database column names. Never solve this by dropping announcement tables or inserting fallback data.