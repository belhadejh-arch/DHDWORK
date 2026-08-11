import { db, employeesTable, attendanceTable, notificationsTable, settingsTable, officesTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { logger } from "./logger";
import { cleanupExpiredSessions } from "./auth";
import { todayStr, nowMinutes, timeToMinutes, startOfTodayAlgiers, isEmployeeWorkDay } from "./time";

// In-memory guards to avoid duplicate notifications within the same process run
const lateNotified = new Set<string>();
const absentMarked = new Set<string>();
const salaryDueNotified = new Set<string>(); // format: "employeeId-YYYY-MM"

async function alreadyNotifiedToday(type: string, referenceId: number): Promise<boolean> {
  const start = startOfTodayAlgiers();
  const rows = await db.select().from(notificationsTable).where(and(
    eq(notificationsTable.type, type),
    eq(notificationsTable.referenceId, referenceId),
    eq(notificationsTable.referenceType, "employee_daily"),
    gte(notificationsTable.createdAt, start),
  ));
  return rows.length > 0;
}

/**
 * Scans every minute:
 * - Late: employee hasn't checked in and current time > workStart + threshold → notify admin once/day.
 * - Absent: employee never checked in and current time > workEnd → mark absent + notify admin & employee.
 */
async function scan(): Promise<void> {
  const today = todayStr();
  const now = nowMinutes();

  const [settings] = await db.select().from(settingsTable).limit(1);
  const lateThreshold = settings?.lateThresholdMinutes ?? 15;

  const employees = await db.select().from(employeesTable).where(eq(employeesTable.isActive, true));
  if (employees.length === 0) return;

  const records = await db.select().from(attendanceTable).where(eq(attendanceTable.date, today));
  const byEmployee = new Map(records.map(r => [r.employeeId, r]));
  const offices = await db.select().from(officesTable);
  const officeName = (id: number) => offices.find(o => o.id === id)?.name ?? "";

  for (const emp of employees) {
    if (!isEmployeeWorkDay(emp.workDays, today)) {
      continue;
    }

    const rec = byEmployee.get(emp.id);
    const name = `${emp.firstName} ${emp.lastName}`;
    const startM = timeToMinutes(emp.workStartTime);
    const endM = timeToMinutes(emp.workEndTime);

    // Late alert (not yet checked in)
    const lateKey = `${emp.id}-${today}`;
    if (!rec?.checkInTime && !rec?.isAbsent && now > startM + lateThreshold && now <= endM && !lateNotified.has(lateKey)) {
      if (!(await alreadyNotifiedToday("late_alert", emp.id))) {
        await db.insert(notificationsTable).values({
          type: "late_alert",
          message: `${name} لم يسجّل الحضور بعد — تجاوز ${lateThreshold} دقيقة من موعد بداية العمل في ${officeName(emp.officeId)}`,
          recipientType: "admin",
          referenceId: emp.id,
          referenceType: "employee_daily",
        });
      }
      lateNotified.add(lateKey);
    }

    // Absence (work day over, never checked in)
    const absentKey = `${emp.id}-${today}`;
    if (now > endM && !rec?.checkInTime && !rec?.isAbsent && !absentMarked.has(absentKey)) {
      if (rec) {
        await db.update(attendanceTable).set({ isAbsent: true, notes: "غياب تلقائي — لم يسجل حضورًا" }).where(eq(attendanceTable.id, rec.id));
      } else {
        await db.insert(attendanceTable).values({
          employeeId: emp.id, officeId: emp.officeId, date: today,
          isAbsent: true, notes: "غياب تلقائي — لم يسجل حضورًا",
        });
      }
      if (!(await alreadyNotifiedToday("absence_alert", emp.id))) {
        await db.insert(notificationsTable).values({
          type: "absence_alert",
          message: `${name} غائب اليوم — لم يسجّل أي حضور في ${officeName(emp.officeId)}`,
          recipientType: "admin",
          referenceId: emp.id,
          referenceType: "employee_daily",
        });
        await db.insert(notificationsTable).values({
          type: "absence_alert",
          message: `تم تسجيلك غائبًا اليوم ${today} لعدم تسجيل الحضور`,
          recipientType: "employee",
          recipientEmployeeId: emp.id,
        });
      }
      absentMarked.add(absentKey);
    }
  }
}

/**
 * Runs once per day — checks if any employee's salary payment day is 2 days away
 * and sends a reminder notification to admin.
 */
async function checkSalaryDueReminders(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDay = today.getDate();
  const currentMonth = (today.getMonth() + 1).toString().padStart(2, '0');
  const currentYear = today.getFullYear();

  const employees = await db.select({
    id: employeesTable.id,
    firstName: employeesTable.firstName,
    lastName: employeesTable.lastName,
    paymentDay: employeesTable.paymentDay,
    officeId: employeesTable.officeId,
  }).from(employeesTable).where(eq(employeesTable.isActive, true));

  const offices = await db.select().from(officesTable);
  const officeName = (id: number) => offices.find(o => o.id === id)?.name ?? "";

  for (const emp of employees) {
    const payDay = emp.paymentDay ?? 25;
    // Days until payDay in current month
    let daysUntil = payDay - todayDay;
    if (daysUntil < 0) {
      // Payment day passed — next occurrence is next month
      const daysInMonth = new Date(currentYear, today.getMonth() + 1, 0).getDate();
      daysUntil = daysInMonth - todayDay + payDay;
    }

    if (daysUntil !== 2) continue;

    const notifKey = `${emp.id}-${currentYear}-${currentMonth}`;
    if (salaryDueNotified.has(notifKey)) continue;

    // Check if already notified in DB today
    const start = startOfTodayAlgiers();
    const existing = await db.select().from(notificationsTable).where(and(
      eq(notificationsTable.type, "salary_due"),
      eq(notificationsTable.referenceId, emp.id),
      eq(notificationsTable.referenceType, "salary_due_reminder"),
      gte(notificationsTable.createdAt, start),
    ));
    if (existing.length > 0) {
      salaryDueNotified.add(notifKey);
      continue;
    }

    const name = `${emp.firstName} ${emp.lastName}`;
    await db.insert(notificationsTable).values({
      type: "salary_due",
      message: `تنبيه: موعد صرف راتب ${name} (${officeName(emp.officeId)}) بعد يومين — يوم ${payDay} من الشهر`,
      recipientType: "admin",
      referenceId: emp.id,
      referenceType: "salary_due_reminder",
    });

    salaryDueNotified.add(notifKey);
    logger.info({ employeeId: emp.id, name, payDay }, "Salary due reminder sent");
  }
}

let lastSalaryCheckDate = "";

export function startBackgroundJobs(): void {
  setInterval(() => {
    scan().catch(err => logger.error({ err }, "attendance scan job failed"));

    // Run salary due check once per day
    const todayDate = todayStr();
    if (todayDate !== lastSalaryCheckDate) {
      lastSalaryCheckDate = todayDate;
      checkSalaryDueReminders().catch(err => logger.error({ err }, "salary due reminder job failed"));
    }
  }, 60 * 1000);

  setInterval(() => {
    cleanupExpiredSessions().catch(() => {});
  }, 60 * 60 * 1000);

  // Run salary check immediately on start
  checkSalaryDueReminders().catch(() => {});

  logger.info("Background jobs started (late/absence scanner)");
}
