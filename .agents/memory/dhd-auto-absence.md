---
name: DHD auto-absence marking
description: How the auto-absence feature works and where it is wired up.
---

The `markAutoAbsences(lookbackDays=30)` function in `dbStore.ts` scans all active employees for workdays in the past N days and inserts absent records for any day that has no attendance row. It uses `onConflictDoNothing()` against the unique `(employeeId, date)` index so it is safe to run repeatedly.

**Why:** Employees who forget to check in should be auto-marked absent — but only on true workdays. The function respects each employee's `restDays` JSON array (defaults to Friday+Saturday if absent) and never marks today as absent (only past days with `date < today`).

**How to apply:**
- Called at API startup and every hour via `setInterval` in `app.ts` (`autoMarkAbsentees()` wrapper).
- Admin can trigger manually via `POST /api/admin/mark-absences?days=N` (requires admin session cookie).
- If false absences appear: check the employee's `restDays` column in the DB — it must be a valid JSON array of 0-indexed weekday numbers (0=Sun, 5=Fri, 6=Sat).
