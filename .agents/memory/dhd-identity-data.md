---
name: DHD identity data
description: Durable data-integrity rules for the DHD employee and QR system.
---

PostgreSQL is the authoritative source for employee, office, and admin identities. Preserve existing IDs, QR values, and employee-to-office relationships; do not substitute local demo records when a database read fails.

**Why:** The imported application contained fallback/demo identity data and permissive QR matching, which could show the wrong employee or authenticate an invalid code.

**How to apply:** Keep identity reads database-backed, match QR only against persisted QR data, and let database errors surface instead of silently returning generated records.