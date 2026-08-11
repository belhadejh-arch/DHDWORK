import { pgTable, serial, integer, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const transactionsTable = pgTable("employee_transactions", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  type: text("type").notNull(), // 'violation' | 'absence' | 'tardiness' | 'bonus' | 'deduction' | 'raise' | 'salary_payment' | 'advance'
  amount: doublePrecision("amount").notNull(), // positive for bonus/addition, negative for deduction/violation
  reason: text("reason").notNull(),
  adminName: text("admin_name").notNull().default("الأدمن"),
  balanceBefore: doublePrecision("balance_before").notNull().default(0),
  balanceAfter: doublePrecision("balance_after").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type EmployeeTransaction = typeof transactionsTable.$inferSelect;
