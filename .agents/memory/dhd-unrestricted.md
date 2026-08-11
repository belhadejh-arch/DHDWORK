---
name: DHD Unrestricted Employee Schedule
description: isUnrestricted boolean on employees skips late/deduction calculations while still recording attendance.
---

# DHD Unrestricted Employee Schedule

## The rule
When `employees.is_unrestricted = TRUE`, the check-in route sets `lateMinutes = 0` and `lateDeduction = 0` regardless of actual arrival time. Attendance (check-in/out times, worked minutes, presence/absence) is still recorded normally.

**Why:** Some employees have flexible schedules; they should be tracked but not penalized for timing.

**How to apply:** Any future attendance logic that reads `lateMinutes` or `lateDeduction` from the employee side (e.g. manual attendance entry) should also respect `isUnrestricted`. Salary generation already works correctly because it sums `late_deduction` from attendance records, which will be 0.

## Schema (added via ALTER TABLE in migrate.ts)
- `employees.is_unrestricted BOOLEAN NOT NULL DEFAULT FALSE`

## API
- `EmployeeWriteSchema` in `artifacts/api-server/src/routes/employees.ts` accepts `isUnrestricted`
- The **list** query (`GET /employees`) explicitly selects `isUnrestricted` — must be kept in sync if the select list is modified
- Check-in logic is in `artifacts/api-server/src/routes/attendance.ts`

## Frontend
`artifacts/dhd-livraison/src/pages/employees.tsx` — checkbox "غير مقيد بالوقت" in the add/edit dialog. When checked, time field labels show "(مرجعي)" to indicate they're reference-only.
