---
name: DHD salary finalization
description: Payroll integrity rules for live reviews, concurrent creation/payment, and immutable paid payslips.
---

Unpaid salary reviews must always be recalculated from current PostgreSQL period data. A paid salary must instead use the immutable snapshot captured by the explicit payment transition.

**Why:** Saved draft totals can become stale, concurrent requests can duplicate a salary or payment side effect, and rebuilding a paid PDF from editable attendance or adjustment records changes an already-issued document.

**How to apply:** Keep one salary row per employee/month/year, make the pending-to-paid transition conditional/idempotent, emit payment side effects only for the winning transition, and serve paid JSON/PDF from the frozen snapshot.

Legacy enhancement scripts must not intercept the React salary page's native review or payment buttons; they may only enhance missing controls such as postpone compatibility.

**Why:** A duplicate document-level click handler prevented the native salary modal from receiving its event and produced a misleading review-load failure.

**How to apply:** Let the salary component own preview and payment state, and keep legacy listeners limited to controls that the component does not implement.

Salary preview reads must fail explicitly when a required PostgreSQL table or query is unavailable; never replace a failed read with zero-valued preview data.

**Why:** A fallback preview can look successful while silently disconnecting the review from the employee's real attendance, deductions, and salary records.

**How to apply:** Keep employee/salary/detail reads strict on the review path and let the API error path report the failure instead of synthesizing a payslip.

Employee salary listing is read-only and must not auto-create the current month's salary row.

**Why:** Opening the employee account should never mutate payroll data; creation belongs to an explicit payroll operation such as payment or postponement.

**How to apply:** Resolve employee payslips through the shared PostgreSQL preview calculation and surface database failures instead of returning in-memory fallback data.