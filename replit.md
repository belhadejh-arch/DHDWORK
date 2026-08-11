# DHD Livraison — HR Management Platform

## Overview
HR management system for a delivery company in Algeria. Manages employees across two fixed offices with attendance tracking (QR + GPS), payroll, and request workflows.

## Stack
- **Frontend**: React + Vite + TanStack Query + shadcn/ui + Tailwind (RTL Arabic/French/English)
- **Backend**: Node.js + Express 5
- **Database**: PostgreSQL on Neon via Drizzle ORM
- **Monorepo**: pnpm workspaces

## Authentication
- **Admin login**: Email + password (`meradex.express16@gmail.com` / `DHD@Admin2024`) **OR** serial number **OR** QR code
- **Employee login**: Serial number **OR** QR code only (no email/password)
- Sessions stored in DB with 30-day expiry; single-device policy for employees

## QR Codes & Serial Numbers
- Every user (admin + employee) has a unique `serial_number` (format `ADM-XXXXXX` / `EMP-XXXXXX`) and `qr_code_data` (random token) stored in the DB
- Generated automatically on user creation
- Admin can view/regenerate any employee's QR from the Employees page (🔲 icon)
- Admin can create 15 default employees at once via the "Create 15 Default Employees" button

## Login Endpoints
- `POST /api/auth/login` — email+password (admin only)
- `POST /api/auth/login/serial` — serial number (admin + employee)
- `POST /api/auth/login/qr` — QR code data (admin + employee)
- `POST /api/auth/regenerate-qr` — regenerate admin's own QR (requires auth)
- `GET /api/employees/:id/qrcode` — get employee's serial + QR data
- `POST /api/employees/:id/qrcode/regenerate` — regenerate employee QR
- `POST /api/employees/seed-defaults` — create 15 default employees

## Running the App
- API server: `PORT=8080 pnpm --filter @workspace/api-server run dev`
- Frontend: `PORT=22444 BASE_PATH=/ pnpm --filter @workspace/dhd-livraison run dev`
- DB push: `cd lib/db && DATABASE_URL=... pnpm run push`

## User Preferences
- Arabic RTL is the primary UI language
