---
name: DHD notification realtime
description: Persisted notifications are synchronized with authenticated SSE and retain polling as a fallback.
---

Persisted in-app notifications should be broadcast after their database transaction commits through an authenticated, recipient-filtered SSE stream; polling and Web Push remain fallback/supplemental delivery paths.

**Why:** Payment and receipt confirmation must become visible to the other party immediately without making delivery depend on browser push support or a client refresh.

**How to apply:** Publish notifications created by both the shared notification helper and transaction-local payroll/violation flows, filter employee events by employee ID, and remove listeners on connection close.