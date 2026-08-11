---
name: DHD violations schema extension
description: violation_type, violation_date, violation_time added to violations table
---

# Violations table extension

Added via ALTER TABLE in `artifacts/api-server/src/lib/migrate.ts`:
- `violation_type TEXT NOT NULL DEFAULT 'manual'` — values: tardiness | absence | early_departure | manual | other
- `violation_date DATE` — nullable (falls back to createdAt in UI)
- `violation_time TEXT` — nullable, HH:MM format

**Why:** user required explicit type classification and separate date/time fields independent of the record's createdAt timestamp.

**How to apply:** any new violation forms must include these fields; payroll calculation only uses `amount` and `status=pending` — violation_type does not affect deduction logic.
