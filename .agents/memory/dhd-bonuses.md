---
name: DHD bonuses feature
description: Admin-created bonuses for employees — schema, API, salary integration, and UI.
---

# DHD Bonuses Feature

## Schema
- New `bonuses` table: id, employee_id, amount, reason, notes, date (TEXT "YYYY-MM-DD"), salary_id (FK nullable), status (pending/applied), created_at
- `lib/db/src/schema/bonuses.ts`, exported from schema index
- Migration SQL appended to `artifacts/api-server/src/lib/migrate.ts` as v6

## API Routes (`artifacts/api-server/src/routes/bonuses.ts`)
- GET /bonuses?employeeId=X&status=Y — auth required
- POST /bonuses — create, sends employee notification (type: bonus_added)
- DELETE /bonuses/:id — pending only (applied cannot be deleted)

## Salary Integration
- Preview, bulk, single generation all fetch pending bonuses → include in finalSalary + salary.bonuses
- After salary insert: bonuses marked status=applied with salaryId set
- Payslip endpoint returns applied bonuses array

## Frontend (`artifacts/dhd-livraison/src/pages/employee-detail.tsx`)
- "إضافة مكافأة" button in page header → Add Bonus dialog
- "تقارير الرواتب" card with 4 tabs: كشوف الرواتب / المكافآت / السلف / المخالفات
- Salary preview dialog shows pending bonus notice

## PDF (`artifacts/dhd-livraison/src/lib/payslip-pdf.ts`)
- generatePayslipPDF accepts `bonuses?: BonusRecord[]`
- Bonuses section renders before advances with date/reason/notes/amount

**Why:** User required per-employee bonus tracking with admin control, notifications, payroll inclusion, and PDF output.
