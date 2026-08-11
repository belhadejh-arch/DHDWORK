---
name: DHD API routing & auth conventions
description: Auth system design, QR/serial login flow, DB migration approach, and key routing conventions for the DHD Livraison project.
---

# DHD API Routing & Auth Conventions

## Auth design
- Admin login: email+password (`POST /api/auth/login`), serial number (`POST /api/auth/login/serial`), or QR code (`POST /api/auth/login/qr`)
- Employee login: serial number or QR code ONLY — no email/password
- Both serial and QR endpoints check admins table first, then employees table
- Admin token stored in `localStorage['dhd_admin_token']`; employee token in `localStorage['employee_token']`
- Sessions in DB with 30-day expiry; single-device policy for employees (`deleteSessionsForUser` before `createSession`)

## QR code & serial number
- `serial_number` column: unique text, format `EMP-XXXXXX` / `ADM-XXXXXX`
- `qr_code_data` column: unique random hex token (`dhd-auth-<32hex>`) — this is what gets encoded in the QR image and sent to the server
- Both columns added to `employees` and `admins` tables
- Generation helpers: `generateUniqueSerialNumber(type)` and `generateUniqueQrCodeData()` in `artifacts/api-server/src/lib/auth.ts`
- Frontend renders QR with `react-qr-code` (already in `artifacts/dhd-livraison/package.json`)

## API proxy — CRITICAL
- Replit's path-based proxy routes `/api/*` to the API server (port 8080) and **strips the `/api` prefix** — the server receives `/auth/login`, not `/api/auth/login`.
- Fix: mount the Express router at BOTH `/api` (for direct/Vite-proxy access) and `/` (for Replit's stripped path): `app.use("/api", router); app.use("/", router);`
- **Why:** The generated API client calls `/api/*` URLs; Replit's proxy strips `/api` before forwarding. Without the `/` mount, all browser requests return 404 HTML and `res.json()` throws, showing a misleading "invalid credentials" error.
- The Vite dev server proxy (`/api` → `http://localhost:8080`) keeps the `/api` prefix, so `app.use("/api", router)` must remain for local-dev Vite proxy to work.

## DB migration approach
- drizzle-kit push (`cd lib/db && DATABASE_URL=... pnpm run push`) is the authoritative way to sync schema
- `push --force` still prompts in non-TTY environments — apply schema changes via raw psql SQL instead
- DB tables don't auto-create on server start; must run push before first boot on a fresh DB

## Auth context limitation
- `useAuth()` context does NOT expose the raw token — get it via `localStorage.getItem('dhd_admin_token')` directly in components that need it

## Admin credentials (Neon DB)
- Email: meradex.express16@gmail.com / Password: 200211ha
- Serial number: ADM-445538
- Password hash algorithm: sha256(password + "dhd_salt_2024")

## Former Employees (Soft-Delete)
- `DELETE /employees/:id` now soft-deletes (sets `deleted_at`, `deletion_reason`, `is_active=false`). Body: `{ reason?: string }`.
- `GET /employees/former` — lists soft-deleted employees.
- `POST /employees/:id/restore` — restores a former employee.
- `DELETE /employees/:id/permanent` — hard-deletes (only works on already-soft-deleted rows).
- `GET /employees` filters out `deleted_at IS NOT NULL`.
- Frontend page: `src/pages/former-employees.tsx`, route `/former-employees`.
- DB columns added via `ALTER TABLE IF NOT EXISTS ... ADD COLUMN IF NOT EXISTS` in migrate.ts.
- Drizzle schema at `lib/db/src/schema/employees.ts` has `deletedAt` and `deletionReason`.

## Admin note on approve (added)
- `advances`, `leave_requests`, `vacation_requests` tables each have `admin_note TEXT` column (ALTER TABLE in migrate.ts v4).
- Approve endpoints (`PATCH /advances/:id/approve`, etc.) accept `{ adminNote?: string }` body.
- API client hooks `useApproveAdvance/Leave/Vacation` accept `{ id, data?: { adminNote?: string } }`.
- Frontend `requests.tsx` shows an approve dialog (with optional note) before confirming.

## Employee QR auto-open after create
- In `employees.tsx`, after successful employee creation the `openQrDialog` is called with the new employee so admin can immediately download/print QR.

## Office QR renew button
- `office-detail.tsx` has a `renewQr()` function that calls `POST /offices/:id/qrcode/regenerate` directly with the admin token from localStorage. Uses `import.meta.env.BASE_URL` for the API prefix.

## i18n Editing Pitfall
- The i18n.tsx translation keys for `en`, `fr`, `ar` all look similar. When inserting by old_string, always use a VALUE that only appears in the target language section, not the generic key name. Arabic values in the English section cause duplicate-key warnings (last-wins, silently wrong).
