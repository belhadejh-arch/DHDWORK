import { pgTable, serial, integer, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const salariesTable = pgTable("salaries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  month: text("month").notNull(), // "2024-01"
  year: integer("year").notNull(),
  baseSalary: doublePrecision("base_salary").notNull(),
  presentDays: integer("present_days").notNull().default(0),
  absentDays: integer("absent_days").notNull().default(0),
  workedHours: doublePrecision("worked_hours").notNull().default(0),
  overtimeHours: doublePrecision("overtime_hours").notNull().default(0),
  overtimeBonus: doublePrecision("overtime_bonus").notNull().default(0),
  lateDeductions: doublePrecision("late_deductions").notNull().default(0),
  advanceDeductions: doublePrecision("advance_deductions").notNull().default(0),
  otherDeductions: doublePrecision("other_deductions").notNull().default(0),
  violationDeductions: doublePrecision("violation_deductions").notNull().default(0),
  bonuses: doublePrecision("bonuses").notNull().default(0),
  finalSalary: doublePrecision("final_salary").notNull(),
  status: text("status").notNull().default("pending"), // pending, paid, postponed
  paidAt: timestamp("paid_at", { withTimezone: true }),
  postponedUntil: timestamp("postponed_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSalarySchema = createInsertSchema(salariesTable).omit({ id: true, createdAt: true });
export type InsertSalary = z.infer<typeof insertSalarySchema>;
export type Salary = typeof salariesTable.$inferSelect;
