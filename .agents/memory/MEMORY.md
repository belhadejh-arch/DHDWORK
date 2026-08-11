# Memory Index

- [DHD API routing & auth conventions](dhd-conventions.md) — API is proxied at root `/api` (not under the web artifact base path); DB migration via raw SQL because drizzle-kit push needs a TTY.
- [DHD violations schema](dhd-violations.md) — violations table has violationType/violationDate/violationTime added via ALTER TABLE in migrate.ts; Drizzle schema uses `date` from drizzle-orm/pg-core.
- [DHD admin management](dhd-admin-management.md) — isPrimary/phone added to admins table; primary admin guard inline in admins.ts; all login endpoints return isPrimary+phone.
- [DHD unrestricted schedule](dhd-unrestricted.md) — isUnrestricted boolean on employees; check-in sets lateMinutes/lateDeduction=0 when true; list query must include isUnrestricted column.
- [DHD bonuses feature](dhd-bonuses.md) — admin-created bonuses table; GET/POST/DELETE /api/bonuses; bonuses auto-included in salary generation; payslip PDF section; employee-detail payroll reports tabs.
- [Workspace typecheck order](workspace-typecheck.md) — build referenced lib packages before app typechecks so stale declaration errors do not mask source errors.
