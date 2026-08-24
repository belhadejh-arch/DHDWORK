import { pgTable, serial, text, integer, timestamp, date, boolean, numeric, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  username: text("username"),
  email: text("email"),
  passwordHash: text("password_hash"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  serialNumber: text("serial_number"),
  qrCodeData: text("qr_code_data"),
  createdAt: timestamp("created_at"),
  isPrimary: boolean("is_primary"),
  phone: text("phone"),
});

export const offices = pgTable("offices", {
  id: serial("id").primaryKey(),
  name: text("name"),
  address: text("address"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  createdAt: timestamp("created_at"),
  qrCodeData: text("qr_code_data"),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  officeId: integer("office_id"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  email: text("email"),
  passwordHash: text("password_hash"),
  position: text("position"),
  hireDate: date("hire_date"),
  baseSalary: numeric("base_salary"),
  paymentDay: integer("payment_day"),
  workStartTime: text("work_start_time"),
  workEndTime: text("work_end_time"),
  isActive: boolean("is_active"),
  serialNumber: text("serial_number"),
  qrCodeData: text("qr_code_data"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  deletedAt: timestamp("deleted_at"),
  deletionReason: text("deletion_reason"),
  isUnrestricted: boolean("is_unrestricted"),
  restDays: text("rest_days"),
});

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"),
  officeId: integer("office_id"),
  date: date("date"),
  checkInTime: text("check_in_time"),
  checkOutTime: text("check_out_time"),
  checkInLat: numeric("check_in_lat"),
  checkInLng: numeric("check_in_lng"),
  checkOutLat: numeric("check_out_lat"),
  checkOutLng: numeric("check_out_lng"),
  workedMinutes: integer("worked_minutes"),
  lateMinutes: integer("late_minutes"),
  overtimeMinutes: integer("overtime_minutes"),
  lateDeduction: numeric("late_deduction"),
  overtimeBonus: numeric("overtime_bonus"),
  isAbsent: boolean("is_absent"),
  notes: text("notes"),
  createdAt: timestamp("created_at"),
}, (table) => ({
  employeeDateUnique: uniqueIndex("attendance_employee_date_unique").on(table.employeeId, table.date),
}));

export const advances = pgTable("advances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"),
  amount: numeric("amount"),
  reason: text("reason"),
  status: text("status"),
  rejectionReason: text("rejection_reason"),
  requestedAt: timestamp("requested_at"),
  resolvedAt: timestamp("resolved_at"),
  adminNote: text("admin_note"),
  salaryId: integer("salary_id"),
});

export const bonuses = pgTable("bonuses", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"),
  amount: numeric("amount"),
  reason: text("reason"),
  notes: text("notes"),
  date: text("date"),
  salaryId: integer("salary_id"),
  status: text("status"),
  createdAt: timestamp("created_at"),
});

export const violations = pgTable("violations", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"),
  reason: text("reason"),
  amount: numeric("amount"),
  notes: text("notes"),
  status: text("status"),
  salaryId: integer("salary_id"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  violationType: text("violation_type"),
  violationDate: date("violation_date"),
  violationTime: text("violation_time"),
});

export const salaries = pgTable("salaries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"),
  month: text("month"),
  year: integer("year"),
  baseSalary: numeric("base_salary"),
  presentDays: integer("present_days"),
  absentDays: integer("absent_days"),
  workedHours: numeric("worked_hours"),
  overtimeHours: numeric("overtime_hours"),
  overtimeBonus: numeric("overtime_bonus"),
  lateDeductions: numeric("late_deductions"),
  advanceDeductions: numeric("advance_deductions"),
  otherDeductions: numeric("other_deductions"),
  violationDeductions: numeric("violation_deductions"),
  bonuses: numeric("bonuses"),
  finalSalary: numeric("final_salary"),
  status: text("status"),
  paidAt: timestamp("paid_at"),
  postponedUntil: timestamp("postponed_until"),
  createdAt: timestamp("created_at"),
  snapshot: text("snapshot"),
}, (table) => ({
  employeePeriodUnique: uniqueIndex("salaries_employee_period_unique").on(table.employeeId, table.month, table.year),
}));

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"),
  leaveType: text("leave_type"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  description: text("description"),
  status: text("status"),
  rejectionReason: text("rejection_reason"),
  requestedAt: timestamp("requested_at"),
  resolvedAt: timestamp("resolved_at"),
  adminNote: text("admin_note"),
});

export const vacationRequests = pgTable("vacation_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  description: text("description"),
  status: text("status"),
  rejectionReason: text("rejection_reason"),
  requestedAt: timestamp("requested_at"),
  resolvedAt: timestamp("resolved_at"),
  adminNote: text("admin_note"),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: text("type"),
  message: text("message"),
  recipientType: text("recipient_type"),
  recipientEmployeeId: integer("recipient_employee_id"),
  referenceId: integer("reference_id"),
  referenceIdType: text("reference_type"),
  isRead: boolean("is_read"),
  createdAt: timestamp("created_at"),
});

export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  level: text("level").notNull().default("normal"),
  durationSeconds: integer("duration_seconds").notNull().default(86400),
  allowDismiss: boolean("allow_dismiss").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull().defaultNow(),
  createdByAdminId: integer("created_by_admin_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  targetAll: boolean("target_all").notNull().default(false),
});

export const announcementRecipients = pgTable("announcement_recipients", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const announcementReads = pgTable("announcement_reads", {
  announcementId: integer("announcement_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  readAt: timestamp("read_at").notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.announcementId, table.employeeId] }),
}));

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  lateDeductionAmount: numeric("late_deduction_amount"),
  first15MinLateDeduction: numeric("first_15_min_late_deduction"),
  hourlyLateDeduction: numeric("hourly_late_deduction"),
  absenceDeductionAmount: numeric("absence_deduction_amount"),
  overtimeHourlyRate: numeric("overtime_hourly_rate"),
  paymentDayOfMonth: integer("payment_day_of_month"),
  lateThresholdMinutes: integer("late_threshold_minutes"),
  language: text("language"),
  darkMode: boolean("dark_mode"),
  updatedAt: timestamp("updated_at"),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  token: text("token"),
  userType: text("user_type"),
  userId: integer("user_id"),
  createdAt: timestamp("created_at"),
  expiresAt: timestamp("expires_at"),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userType: text("user_type").notNull(),
  employeeId: integer("employee_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
