import { pgTable, serial, text, integer, timestamp, date, boolean, numeric, jsonb } from "drizzle-orm/pg-core";

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"), // "superadmin" | "admin"
  officeId: integer("office_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const offices = pgTable("offices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  city: text("city").notNull(),
  address: text("address"),
  phone: text("phone"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  geofenceRadiusMeters: integer("geofence_radius_meters").default(100),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  nationalId: text("national_id").unique(),
  employeeCode: text("employee_code").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull().default("delivery_driver"), // "delivery_driver" | "office_agent" | "warehouse_worker" | "manager"
  officeId: integer("office_id").references(() => offices.id),
  baseSalary: numeric("base_salary").notNull(),
  status: text("status").notNull().default("active"), // "active" | "inactive" | "on_leave"
  qrCodeSecret: text("qr_code_secret"),
  pinCode: text("pin_code"),
  joinedAt: date("joined_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  date: date("date").notNull(),
  checkIn: timestamp("check_in"),
  checkOut: timestamp("check_out"),
  status: text("status").notNull().default("present"), // "present" | "absent" | "late" | "half_day"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const advances = pgTable("advances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  amount: numeric("amount").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected" | "paid"
  requestDate: date("request_date").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bonuses = pgTable("bonuses", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  amount: numeric("amount").notNull(),
  reason: text("reason").notNull(),
  month: text("month").notNull(), // "YYYY-MM"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const violations = pgTable("violations", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  type: text("type").notNull(),
  deductionAmount: numeric("deduction_amount").default("0").notNull(),
  reason: text("reason").notNull(),
  date: date("date").defaultNow().notNull(),
  status: text("status").notNull().default("applied"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const salaries = pgTable("salaries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  month: text("month").notNull(), // "YYYY-MM"
  baseSalary: numeric("base_salary").notNull(),
  bonusesTotal: numeric("bonuses_total").default("0").notNull(),
  advancesTotal: numeric("advances_total").default("0").notNull(),
  violationsTotal: numeric("violations_total").default("0").notNull(),
  netSalary: numeric("net_salary").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "paid" | "deferred"
  postponedUntil: date("postponed_until"),
  paymentDate: timestamp("payment_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  leaveType: text("leave_type").notNull(), // "sick" | "personal" | "unpaid" | "other"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const vacationRequests = pgTable("vacation_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  daysRequested: integer("days_requested").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  recipientType: text("recipient_type").notNull().default("admin"), // "admin" | "employee"
  recipientId: integer("recipient_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").default("DHD Livraison").notNull(),
  currency: text("currency").default("DZD").notNull(),
  language: text("language").default("ar").notNull(),
  workStartTime: text("work_start_time").default("08:00").notNull(),
  workEndTime: text("work_end_time").default("17:00").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
