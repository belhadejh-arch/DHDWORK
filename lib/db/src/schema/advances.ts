import { pgTable, serial, integer, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const advancesTable = pgTable("advances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  amount: doublePrecision("amount").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  rejectionReason: text("rejection_reason"),
  adminNote: text("admin_note"),
  /** Set when this advance is deducted in a generated salary — prevents double-deduction */
  salaryId: integer("salary_id"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const insertAdvanceSchema = createInsertSchema(advancesTable).omit({ id: true, requestedAt: true });
export type InsertAdvance = z.infer<typeof insertAdvanceSchema>;
export type Advance = typeof advancesTable.$inferSelect;
