import { pgTable, serial, text, integer, doublePrecision, boolean, timestamp, date, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { officesTable } from "./offices";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  officeId: integer("office_id").notNull().references(() => officesTable.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  position: text("position").notNull(),
  hireDate: date("hire_date", { mode: "string" }),
  baseSalary: doublePrecision("base_salary").notNull(),
  paymentDay: integer("payment_day"),
  workStartTime: text("work_start_time").notNull().default("09:00"),
  workEndTime: text("work_end_time").notNull().default("17:30"),
  workDays: json("work_days").$type<string[]>().notNull().default(["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"]),
  isUnrestricted: boolean("is_unrestricted").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  serialNumber: text("serial_number").unique(),
  qrCodeData: text("qr_code_data").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletionReason: text("deletion_reason"),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
