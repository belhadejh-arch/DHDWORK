/**
 * Raw SQL migration — creates all tables if they don't exist.
 * Use instead of drizzle-kit push (which requires a TTY).
 *
 * Run: pnpm --filter @workspace/scripts tsx src/migrate.ts
 */
import pg from "pg";

const { Pool } = pg;

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL must be set");

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

const SQL = /* sql */ `
-- ── Offices ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offices (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  address         TEXT,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  qr_code_data    TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Admins ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id              SERIAL PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL UNIQUE DEFAULT '',
  password_hash   TEXT NOT NULL,
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT NOT NULL DEFAULT '',
  serial_number   TEXT UNIQUE,
  qr_code_data    TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Employees ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id              SERIAL PRIMARY KEY,
  office_id       INTEGER NOT NULL REFERENCES offices(id),
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT UNIQUE,
  password_hash   TEXT,
  position        TEXT NOT NULL,
  hire_date       DATE,
  base_salary     DOUBLE PRECISION NOT NULL,
  payment_day     INTEGER,
  work_start_time TEXT NOT NULL DEFAULT '09:00',
  work_end_time   TEXT NOT NULL DEFAULT '17:30',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  serial_number   TEXT UNIQUE,
  qr_code_data    TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  user_type   TEXT NOT NULL,
  user_id     INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- ── Attendance ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id                SERIAL PRIMARY KEY,
  employee_id       INTEGER NOT NULL REFERENCES employees(id),
  office_id         INTEGER NOT NULL REFERENCES offices(id),
  date              DATE NOT NULL,
  check_in_time     TEXT,
  check_out_time    TEXT,
  check_in_lat      DOUBLE PRECISION,
  check_in_lng      DOUBLE PRECISION,
  check_out_lat     DOUBLE PRECISION,
  check_out_lng     DOUBLE PRECISION,
  worked_minutes    INTEGER,
  late_minutes      INTEGER,
  overtime_minutes  INTEGER,
  late_deduction    DOUBLE PRECISION,
  overtime_bonus    DOUBLE PRECISION,
  is_absent         BOOLEAN NOT NULL DEFAULT FALSE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_employee_date_unique UNIQUE (employee_id, date)
);

-- ── Salaries ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salaries (
  id                    SERIAL PRIMARY KEY,
  employee_id           INTEGER NOT NULL REFERENCES employees(id),
  month                 TEXT NOT NULL,
  year                  INTEGER NOT NULL,
  base_salary           DOUBLE PRECISION NOT NULL,
  present_days          INTEGER NOT NULL DEFAULT 0,
  absent_days           INTEGER NOT NULL DEFAULT 0,
  worked_hours          DOUBLE PRECISION NOT NULL DEFAULT 0,
  overtime_hours        DOUBLE PRECISION NOT NULL DEFAULT 0,
  overtime_bonus        DOUBLE PRECISION NOT NULL DEFAULT 0,
  late_deductions       DOUBLE PRECISION NOT NULL DEFAULT 0,
  advance_deductions    DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_deductions      DOUBLE PRECISION NOT NULL DEFAULT 0,
  violation_deductions  DOUBLE PRECISION NOT NULL DEFAULT 0,
  bonuses               DOUBLE PRECISION NOT NULL DEFAULT 0,
  final_salary          DOUBLE PRECISION NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',
  paid_at               TIMESTAMPTZ,
  postponed_until       TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Advances ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS advances (
  id                SERIAL PRIMARY KEY,
  employee_id       INTEGER NOT NULL REFERENCES employees(id),
  amount            DOUBLE PRECISION NOT NULL,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  rejection_reason  TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

-- ── Leave Requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id                SERIAL PRIMARY KEY,
  employee_id       INTEGER NOT NULL REFERENCES employees(id),
  leave_type        TEXT NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  rejection_reason  TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

-- ── Vacation Requests ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vacation_requests (
  id                SERIAL PRIMARY KEY,
  employee_id       INTEGER NOT NULL REFERENCES employees(id),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  rejection_reason  TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

-- ── Violations ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS violations (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  reason      TEXT NOT NULL,
  amount      DOUBLE PRECISION,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  salary_id   INTEGER REFERENCES salaries(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                      SERIAL PRIMARY KEY,
  type                    TEXT NOT NULL DEFAULT 'general',
  message                 TEXT NOT NULL,
  recipient_type          TEXT NOT NULL DEFAULT 'admin',
  recipient_employee_id   INTEGER,
  reference_id            INTEGER,
  reference_type          TEXT,
  is_read                 BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Settings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id                        SERIAL PRIMARY KEY,
  late_deduction_amount     DOUBLE PRECISION NOT NULL DEFAULT 500,
  overtime_hourly_rate      DOUBLE PRECISION NOT NULL DEFAULT 200,
  payment_day_of_month      INTEGER NOT NULL DEFAULT 25,
  late_threshold_minutes    INTEGER NOT NULL DEFAULT 15,
  language                  TEXT NOT NULL DEFAULT 'ar',
  dark_mode                 BOOLEAN NOT NULL DEFAULT FALSE
);

-- Seed default settings row if missing
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Alter advances: add admin_note and salary_id if missing ───────────────────
ALTER TABLE advances ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE advances ADD COLUMN IF NOT EXISTS salary_id INTEGER REFERENCES salaries(id);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS first_15min_late_deduction DOUBLE PRECISION NOT NULL DEFAULT 200;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS hourly_late_deduction DOUBLE PRECISION NOT NULL DEFAULT 100;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS absence_deduction_amount DOUBLE PRECISION NOT NULL DEFAULT 1000;

CREATE TABLE IF NOT EXISTS employee_transactions (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id),
  type            TEXT NOT NULL,
  amount          DOUBLE PRECISION NOT NULL,
  reason          TEXT NOT NULL,
  admin_name      TEXT NOT NULL DEFAULT 'الأدمن',
  balance_before  DOUBLE PRECISION NOT NULL DEFAULT 0,
  balance_after   DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function main() {
  console.log("Running migrations…");
  await pool.query(SQL);
  console.log("✅ All tables created (or already existed).");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
