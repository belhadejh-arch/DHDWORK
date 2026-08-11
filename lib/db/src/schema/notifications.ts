import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("general"), // advance_request, leave_request, vacation_request, salary_due, attendance_alert, late_alert, absence_alert, general
  message: text("message").notNull(),
  recipientType: text("recipient_type").notNull().default("admin"), // 'admin' | 'employee'
  recipientEmployeeId: integer("recipient_employee_id"),
  referenceId: integer("reference_id"),
  referenceType: text("reference_type"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
