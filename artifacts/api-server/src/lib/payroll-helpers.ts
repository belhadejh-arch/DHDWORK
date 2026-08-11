import { db, settingsTable, employeesTable, notificationsTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface DeductionSettings {
  first15MinLateDeduction: number;
  hourlyLateDeduction: number;
  absenceDeductionAmount: number;
  overtimeHourlyRate: number;
  lateThresholdMinutes: number;
}

export async function getDeductionSettings(): Promise<DeductionSettings> {
  const [settings] = await db.select().from(settingsTable).limit(1);
  return {
    first15MinLateDeduction: settings?.first15MinLateDeduction ?? 200,
    hourlyLateDeduction: settings?.hourlyLateDeduction ?? 100,
    absenceDeductionAmount: settings?.absenceDeductionAmount ?? 1000,
    overtimeHourlyRate: settings?.overtimeHourlyRate ?? 200,
    lateThresholdMinutes: settings?.lateThresholdMinutes ?? 15,
  };
}

export function calculateLateDeduction(lateMinutes: number, settings: DeductionSettings, isUnrestricted = false): number {
  if (isUnrestricted || lateMinutes <= 0) return 0;
  if (lateMinutes <= 15) {
    return settings.first15MinLateDeduction;
  } else {
    const extraHours = Math.ceil((lateMinutes - 15) / 60);
    return settings.first15MinLateDeduction + extraHours * settings.hourlyLateDeduction;
  }
}

export async function recordAbsenceDeduction(employeeId: number, dateStr: string) {
  const settings = await getDeductionSettings();
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) return;

  const amount = settings.absenceDeductionAmount;
  const baseSal = emp.baseSalary;

  // Record in audit log
  await db.insert(transactionsTable).values({
    employeeId,
    type: "absence",
    amount: -amount,
    reason: `خصم غياب يوم ${dateStr}`,
    adminName: "النظام التلقائي",
    balanceBefore: baseSal,
    balanceAfter: baseSal - amount,
  });

  // Notify employee directly
  await db.insert(notificationsTable).values({
    type: "absence_alert",
    message: `تم تسجيل غياب بتاريخ ${dateStr} وخصم مبلغ ${amount} دج من حسابك`,
    recipientType: "employee",
    recipientEmployeeId: employeeId,
    referenceId: employeeId,
    referenceType: "attendance",
  });
}

export async function recordLateDeduction(employeeId: number, dateStr: string, lateMinutes: number, deductionAmount: number) {
  if (deductionAmount <= 0) return;
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) return;

  const baseSal = emp.baseSalary;

  // Record in audit log
  await db.insert(transactionsTable).values({
    employeeId,
    type: "tardiness",
    amount: -deductionAmount,
    reason: `خصم تأخير (${lateMinutes} دقيقة) بتاريخ ${dateStr}`,
    adminName: "النظام التلقائي",
    balanceBefore: baseSal,
    balanceAfter: baseSal - deductionAmount,
  });

  // Notify employee directly
  await db.insert(notificationsTable).values({
    type: "late_alert",
    message: `تأخير لمدة ${lateMinutes} دقيقة بتاريخ ${dateStr}. تم خصم ${deductionAmount} دج`,
    recipientType: "employee",
    recipientEmployeeId: employeeId,
    referenceId: employeeId,
    referenceType: "attendance",
  });
}
