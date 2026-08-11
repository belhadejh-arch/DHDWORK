import { pgTable, serial, integer, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { salariesTable } from "./salaries";

export const bonusesTable = pgTable("bonuses", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  amount: doublePrecision("amount").notNull(),
  reason: text("reason").notNull(),
  notes: text("notes"),
  date: text("date").notNull(), // "YYYY-MM-DD"
  salaryId: integer("salary_id").references(() => salariesTable.id),
  status: text("status").notNull().default("pending"), // pending, applied
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBonusSchema = createInsertSchema(bonusesTable).omit({ id: true, createdAt: true });
export type InsertBonus = z.infer<typeof insertBonusSchema>;
export type Bonus = typeof bonusesTable.$inferSelect;
