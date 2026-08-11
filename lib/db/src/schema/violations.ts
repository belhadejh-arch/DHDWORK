import { pgTable, serial, integer, text, doublePrecision, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { salariesTable } from "./salaries";

export const violationsTable = pgTable("violations", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  violationType: text("violation_type").notNull().default("manual"), // tardiness | absence | early_departure | manual | other
  violationDate: date("violation_date"), // nullable = use createdAt
  violationTime: text("violation_time"), // HH:MM, nullable
  reason: text("reason").notNull(),
  amount: doublePrecision("amount"), // nullable = amount not yet set
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending | deducted
  salaryId: integer("salary_id").references(() => salariesTable.id), // set when deducted
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertViolationSchema = createInsertSchema(violationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertViolation = z.infer<typeof insertViolationSchema>;
export type Violation = typeof violationsTable.$inferSelect;
