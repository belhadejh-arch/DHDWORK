import { pgTable, serial, doublePrecision, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  lateDeductionAmount: doublePrecision("late_deduction_amount").notNull().default(500),
  overtimeHourlyRate: doublePrecision("overtime_hourly_rate").notNull().default(200),
  paymentDayOfMonth: integer("payment_day_of_month").notNull().default(25),
  lateThresholdMinutes: integer("late_threshold_minutes").notNull().default(15),
  first15MinLateDeduction: doublePrecision("first_15min_late_deduction").notNull().default(200),
  hourlyLateDeduction: doublePrecision("hourly_late_deduction").notNull().default(100),
  absenceDeductionAmount: doublePrecision("absence_deduction_amount").notNull().default(1000),
  language: text("language").notNull().default("ar"),
  darkMode: boolean("dark_mode").notNull().default(false),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
