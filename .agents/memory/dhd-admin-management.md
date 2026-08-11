---
name: DHD Admin Management
description: isPrimary and phone fields added to admins table; primary-only guard pattern; all login responses include these fields.
---

# DHD Admin Management

## The rule
All admin CRUD operations (create/update/delete/QR) in `artifacts/api-server/src/routes/admins.ts` are gated by an inline `isPrimaryAdmin(adminId)` helper that queries the DB. The primary admin is the one with `is_primary = TRUE` (set via migration UPDATE on the oldest admin row).

**Why:** Only the primary admin can manage other admins — enforced server-side to prevent privilege escalation.

**How to apply:** When adding new admin-management endpoints, always call `isPrimaryAdmin(req.adminId!)` and return 403 if false. Never trust the client's claim about being primary.

## Schema additions (added via ALTER TABLE in migrate.ts)
- `admins.is_primary BOOLEAN NOT NULL DEFAULT FALSE`
- `admins.phone TEXT`
- Migration sets primary: `UPDATE admins SET is_primary = TRUE WHERE id = (SELECT MIN(id) FROM admins) AND is_primary = FALSE`

## All login endpoints return isPrimary + phone
`/auth/login`, `/auth/login/serial`, `/auth/login/qr`, and `/auth/me` all return `isPrimary` and `phone` in the admin object. The frontend checks `adminAny?.isPrimary === true` to show the Admin Management section in Settings.

## Frontend
`artifacts/dhd-livraison/src/pages/settings.tsx` — Admin Management card is only rendered when `isPrimary === true`. Uses `/admins` CRUD endpoints directly via `adminFetch`.
