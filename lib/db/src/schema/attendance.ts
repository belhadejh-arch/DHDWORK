import { pgTable, serial, integer, text, date, doublePrecision, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { officesTable } from "./offices";

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  officeId: integer("office_id").notNull().references(() => officesTable.id),
  date: date("date", { mode: "string" }).notNull(),
  checkInTime: text("check_in_time"),
  checkOutTime: text("check_out_time"),
  checkInLat: doublePrecision("check_in_lat"),
  checkInLng: doublePrecision("check_in_lng"),
  checkOutLat: doublePrecision("check_out_lat"),
  checkOutLng: doublePrecision("check_out_lng"),
  workedMinutes: integer("worked_minutes"),
  lateMinutes: integer("late_minutes"),
  overtimeMinutes: integer("overtime_minutes"),
  lateDeduction: doublePrecision("late_deduction"),
  overtimeBonus: doublePrecision("overtime_bonus"),
  isAbsent: boolean("is_absent").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("attendance_employee_date_unique").on(t.employeeId, t.date),
]);

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;
