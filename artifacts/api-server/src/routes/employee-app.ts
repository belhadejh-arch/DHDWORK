import { Router, type IRouter } from "express";
import {
  db, employeesTable, officesTable, attendanceTable, settingsTable,
  advancesTable, leaveRequestsTable, vacationRequestsTable,
  notificationsTable, salariesTable, violationsTable, bonusesTable,
} from "@workspace/db";
import { eq, and, desc, isNull, isNotNull, lte, gte } from "drizzle-orm";
import { z } from "zod";
import { deleteSession, getTokenFromRequest } from "../lib/auth";
import { requireEmployeeAuth } from "../middlewares/requireAuth";
import { validateQrToken } from "./offices";
import { haversineDistance, MAX_ATTENDANCE_RADIUS_METERS } from "../lib/gps";
import { todayStr, nowTimeStr, timeToMinutes } from "../lib/time";

const router: IRouter = Router();

async function notifyAdmin(type: string, message: string, referenceId?: number, referenceType?: string) {
  await db.insert(notificationsTable).values({
    type, message, recipientType: "admin",
    referenceId: referenceId ?? null, referenceType: referenceType ?? null,
  });
}
async function notifyEmployee(employeeId: number, type: string, message: string) {
  await db.insert(notificationsTable).values({
    type, message, recipientType: "employee", recipientEmployeeId: employeeId,
  });
}

function publicEmployee(emp: typeof employeesTable.$inferSelect, officeName: string | null) {
  const { passwordHash: _ph, qrCodeData: _qr, ...rest } = emp;
  return { ...rest, officeName };
}

// ---------- Auth ----------
// Employees log in via QR code or serial number through /auth/login/qr and /auth/login/serial.
// Email/password login is NOT available for employees.

router.post("/employee/auth/logout", async (req, res): Promise<void> => {
  const token = getTokenFromRequest(req);
  if (token) await deleteSession(token);
  res.json({ success: true });
});

router.get("/employee/me", requireEmployeeAuth, async (req, res): Promise<void> => {
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, req.employeeId!));
  if (!emp) { res.status(401).json({ error: "Not found" }); return; }
  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId));
  res.json(publicEmployee(emp, office?.name ?? null));
});

// ---------- Attendance (QR + GPS) ----------
const AttendanceActionBody = z.object({
  qrToken: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
});

async function validateAttendancePreconditions(employeeId: number, body: unknown): Promise<
  | { ok: true; emp: typeof employeesTable.$inferSelect; office: typeof officesTable.$inferSelect; latitude: number; longitude: number }
  | { ok: false; status: number; error: string }
> {
  const parsed = AttendanceActionBody.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "gps_required" };
  }
  const { qrToken, latitude, longitude } = parsed.data;

  const tokenOfficeId = await validateQrToken(qrToken);
  if (!tokenOfficeId) return { ok: false, status: 400, error: "invalid_qr" };

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) return { ok: false, status: 401, error: "not_found" };
  if (emp.officeId !== tokenOfficeId) return { ok: false, status: 403, error: "wrong_office" };

  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, tokenOfficeId));
  if (!office) return { ok: false, status: 400, error: "office_not_found" };

  const distance = haversineDistance(latitude, longitude, office.latitude, office.longitude);
  if (distance > MAX_ATTENDANCE_RADIUS_METERS) {
    return { ok: false, status: 403, error: `out_of_range:${Math.round(distance)}` };
  }
  return { ok: true, emp, office, latitude, longitude };
}

router.post("/employee/attendance/checkin", requireEmployeeAuth, async (req, res): Promise<void> => {
  const check = await validateAttendancePreconditions(req.employeeId!, req.body);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { emp, office, latitude, longitude } = check;

  const today = todayStr();
  const [existing] = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, emp.id), eq(attendanceTable.date, today)));
  if (existing?.checkInTime) { res.status(400).json({ error: "already_checked_in" }); return; }
  if (existing?.isAbsent) { res.status(400).json({ error: "marked_absent" }); return; }

  const [settings] = await db.select().from(settingsTable).limit(1);
  const lateThreshold = settings?.lateThresholdMinutes ?? 15;
  const lateDeductionAmount = settings?.lateDeductionAmount ?? 500;

  const checkInTime = nowTimeStr();
  const lateMinutes = Math.max(0, timeToMinutes(checkInTime) - timeToMinutes(emp.workStartTime));
  const isLate = lateMinutes > lateThreshold;
  const lateDeduction = isLate ? lateDeductionAmount : 0;

  let record;
  if (existing) {
    [record] = await db.update(attendanceTable)
      .set({ checkInTime, checkInLat: latitude, checkInLng: longitude, lateMinutes, lateDeduction })
      .where(eq(attendanceTable.id, existing.id)).returning();
  } else {
    [record] = await db.insert(attendanceTable).values({
      employeeId: emp.id, officeId: office.id, date: today,
      checkInTime, checkInLat: latitude, checkInLng: longitude, lateMinutes, lateDeduction,
    }).returning();
  }

  const name = `${emp.firstName} ${emp.lastName}`;
  await notifyAdmin("attendance_alert", `${name} سجّل الحضور في ${office.name} على الساعة ${checkInTime}`, record.id, "attendance");
  if (isLate) {
    await notifyAdmin("late_alert", `${name} متأخر ${lateMinutes} دقيقة عن موعد الحضور في ${office.name} — تم احتساب خصم ${lateDeduction} دج`, record.id, "attendance");
    await notifyEmployee(emp.id, "late_alert", `تم تسجيل تأخير ${lateMinutes} دقيقة اليوم وخصم ${lateDeduction} دج من راتبك`);
  }
  res.status(201).json({ ...record, officeName: office.name, isLate });
});

router.post("/employee/attendance/checkout", requireEmployeeAuth, async (req, res): Promise<void> => {
  const check = await validateAttendancePreconditions(req.employeeId!, req.body);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { emp, office, latitude, longitude } = check;

  const today = todayStr();
  const [existing] = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, emp.id), eq(attendanceTable.date, today)));
  if (!existing?.checkInTime) { res.status(400).json({ error: "not_checked_in" }); return; }
  if (existing.checkOutTime) { res.status(400).json({ error: "already_checked_out" }); return; }

  const [settings] = await db.select().from(settingsTable).limit(1);
  const overtimeHourlyRate = settings?.overtimeHourlyRate ?? 200;

  const checkOutTime = nowTimeStr();
  const workedMinutes = Math.max(0, timeToMinutes(checkOutTime) - timeToMinutes(existing.checkInTime));
  const overtimeMinutes = Math.max(0, timeToMinutes(checkOutTime) - timeToMinutes(emp.workEndTime));
  const overtimeBonus = (overtimeMinutes / 60) * overtimeHourlyRate;

  const [record] = await db.update(attendanceTable)
    .set({ checkOutTime, checkOutLat: latitude, checkOutLng: longitude, workedMinutes, overtimeMinutes, overtimeBonus })
    .where(eq(attendanceTable.id, existing.id)).returning();

  const name = `${emp.firstName} ${emp.lastName}`;
  await notifyAdmin("attendance_alert", `${name} سجّل الانصراف من ${office.name} على الساعة ${checkOutTime}`, record.id, "attendance");
  res.json({ ...record, officeName: office.name });
});

router.get("/employee/attendance", requireEmployeeAuth, async (req, res): Promise<void> => {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  let records = await db.select().from(attendanceTable)
    .where(eq(attendanceTable.employeeId, req.employeeId!))
    .orderBy(desc(attendanceTable.date));
  if (month) records = records.filter(r => r.date.startsWith(month));
  res.json(records);
});

// ---------- Requests ----------
router.get("/employee/requests", requireEmployeeAuth, async (req, res): Promise<void> => {
  const empId = req.employeeId!;
  const [advances, leaves, vacations] = await Promise.all([
    db.select().from(advancesTable).where(eq(advancesTable.employeeId, empId)).orderBy(desc(advancesTable.requestedAt)),
    db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.employeeId, empId)).orderBy(desc(leaveRequestsTable.requestedAt)),
    db.select().from(vacationRequestsTable).where(eq(vacationRequestsTable.employeeId, empId)).orderBy(desc(vacationRequestsTable.requestedAt)),
  ]);
  res.json({
    advances,
    leaveRequests: leaves,
    vacationRequests: vacations,
  });
});

const AdvanceBody = z.object({ amount: z.number().positive(), reason: z.string().optional() });
router.post("/employee/requests/advance", requireEmployeeAuth, async (req, res): Promise<void> => {
  const parsed = AdvanceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid" }); return; }
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, req.employeeId!));
  const [row] = await db.insert(advancesTable).values({
    employeeId: req.employeeId!, amount: parsed.data.amount, reason: parsed.data.reason ?? null, status: "pending",
  }).returning();
  await notifyAdmin("advance_request", `${emp!.firstName} ${emp!.lastName} طلب سلفة بقيمة ${parsed.data.amount} دج`, row.id, "advance");
  res.status(201).json(row);
});

const LeaveBody = z.object({
  leaveType: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  description: z.string().optional(),
});
router.post("/employee/requests/leave", requireEmployeeAuth, async (req, res): Promise<void> => {
  const parsed = LeaveBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid" }); return; }
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, req.employeeId!));
  const [row] = await db.insert(leaveRequestsTable).values({
    employeeId: req.employeeId!, leaveType: parsed.data.leaveType,
    startDate: parsed.data.startDate, endDate: parsed.data.endDate,
    description: parsed.data.description ?? null, status: "pending",
  }).returning();
  await notifyAdmin("leave_request", `${emp!.firstName} ${emp!.lastName} قدّم طلب غياب/إجازة مرضية`, row.id, "leave_request");
  res.status(201).json(row);
});

const VacationBody = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  description: z.string().optional(),
});
router.post("/employee/requests/vacation", requireEmployeeAuth, async (req, res): Promise<void> => {
  const parsed = VacationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid" }); return; }
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, req.employeeId!));
  const [row] = await db.insert(vacationRequestsTable).values({
    employeeId: req.employeeId!,
    startDate: parsed.data.startDate, endDate: parsed.data.endDate,
    description: parsed.data.description ?? null, status: "pending",
  }).returning();
  await notifyAdmin("vacation_request", `${emp!.firstName} ${emp!.lastName} قدّم طلب عطلة`, row.id, "vacation_request");
  res.status(201).json(row);
});

// ---------- Notifications ----------
router.get("/employee/notifications", requireEmployeeAuth, async (req, res): Promise<void> => {
  const unreadOnly = req.query.unreadOnly === "true";
  let rows = await db.select().from(notificationsTable)
    .where(and(eq(notificationsTable.recipientType, "employee"), eq(notificationsTable.recipientEmployeeId, req.employeeId!)))
    .orderBy(desc(notificationsTable.createdAt));
  if (unreadOnly) rows = rows.filter(n => !n.isRead);
  res.json(rows);
});

router.patch("/employee/notifications/:id/read", requireEmployeeAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.update(notificationsTable).set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.recipientEmployeeId, req.employeeId!)))
    .returning();
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  res.json(row);
});

router.patch("/employee/notifications/read-all", requireEmployeeAuth, async (req, res): Promise<void> => {
  await db.update(notificationsTable).set({ isRead: true })
    .where(and(eq(notificationsTable.recipientType, "employee"), eq(notificationsTable.recipientEmployeeId, req.employeeId!)));
  res.json({ success: true });
});

// ---------- Violations ----------
router.get("/employee/violations", requireEmployeeAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(violationsTable)
    .where(eq(violationsTable.employeeId, req.employeeId!));
  res.json(rows);
});

// ---------- Salary ----------
router.get("/employee/salaries", requireEmployeeAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(salariesTable)
    .where(eq(salariesTable.employeeId, req.employeeId!))
    .orderBy(desc(salariesTable.year), desc(salariesTable.month));
  res.json(rows);
});

// Employee payslip — returns full payslip data for the employee's own salary
router.get("/employee/salaries/:id/payslip", requireEmployeeAuth, async (req, res): Promise<void> => {
  const salaryId = Number(req.params.id);
  if (isNaN(salaryId)) { res.status(400).json({ error: "invalid id" }); return; }

  const [salary] = await db.select().from(salariesTable)
    .where(and(eq(salariesTable.id, salaryId), eq(salariesTable.employeeId, req.employeeId!)));
  if (!salary) { res.status(404).json({ error: "Salary not found" }); return; }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, salary.employeeId));
  const [office] = emp ? await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId)) : [];

  const monthStr = `${salary.year}-${salary.month}`;
  const allAttendance = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, salary.employeeId));
  const attendanceRecords = allAttendance.filter(r => r.date.startsWith(monthStr));

  const advances = await db.select().from(advancesTable)
    .where(and(eq(advancesTable.employeeId, salary.employeeId), eq(advancesTable.salaryId, salary.id)));

  const violations = await db.select().from(violationsTable)
    .where(and(eq(violationsTable.employeeId, salary.employeeId), eq(violationsTable.salaryId, salary.id)));

  const bonuses = await db.select().from(bonusesTable)
    .where(and(eq(bonusesTable.employeeId, salary.employeeId), eq(bonusesTable.salaryId, salary.id)));

  // Leave & vacation overlapping this month
  const monthStart = `${salary.year}-${salary.month}-01`;
  const monthEndDate = new Date(salary.year, parseInt(salary.month), 0);
  const monthEnd = monthEndDate.toISOString().split('T')[0];

  const [leaveRequests, vacationRequests] = await Promise.all([
    db.select().from(leaveRequestsTable).where(and(
      eq(leaveRequestsTable.employeeId, salary.employeeId),
      eq(leaveRequestsTable.status, "approved"),
      lte(leaveRequestsTable.startDate, monthEnd),
      gte(leaveRequestsTable.endDate, monthStart),
    )),
    db.select().from(vacationRequestsTable).where(and(
      eq(vacationRequestsTable.employeeId, salary.employeeId),
      eq(vacationRequestsTable.status, "approved"),
      lte(vacationRequestsTable.startDate, monthEnd),
      gte(vacationRequestsTable.endDate, monthStart),
    )),
  ]);

  const { passwordHash: _ph, qrCodeData: _qr, ...empSafe } = emp ?? { passwordHash: '', qrCodeData: '' };
  res.json({
    salary: { ...salary, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null, officeName: office?.name ?? null },
    employee: { ...empSafe, officeName: office?.name ?? null },
    office: office ?? null,
    companyName: "DHD Livraison",
    attendanceRecords: attendanceRecords.sort((a, b) => a.date.localeCompare(b.date)),
    advances,
    violations,
    leaveRequests,
    vacationRequests,
    bonuses,
  });
});

// ---------- Salary Balance (live running balance for current month) ----------
router.get("/employee/salary-balance", requireEmployeeAuth, async (req, res): Promise<void> => {
  const empId = req.employeeId!;
  const today = new Date();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const year = today.getFullYear();
  const monthStr = `${year}-${month}`;

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));
  if (!emp) { res.status(404).json({ error: "Not found" }); return; }

  // Late deductions accumulated this month
  const allAttendance = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, empId));
  const monthRecords = allAttendance.filter(r => r.date.startsWith(monthStr));
  const lateDeductions = monthRecords.reduce((s, r) => s + (r.lateDeduction ?? 0), 0);

  // Approved advances not yet deducted in any salary
  const advances = await db.select().from(advancesTable)
    .where(and(eq(advancesTable.employeeId, empId), eq(advancesTable.status, "approved"), isNull(advancesTable.salaryId)));
  const advanceDeductions = advances.reduce((s, a) => s + a.amount, 0);

  // Pending violation amounts
  const violations = await db.select().from(violationsTable)
    .where(and(eq(violationsTable.employeeId, empId), eq(violationsTable.status, "pending"), isNotNull(violationsTable.amount)));
  const violationDeductions = violations.reduce((s, v) => s + (v.amount ?? 0), 0);

  const totalDeductions = lateDeductions + advanceDeductions + violationDeductions;
  const currentBalance = Math.max(0, emp.baseSalary - totalDeductions);

  res.json({
    baseSalary: emp.baseSalary,
    month,
    year,
    lateDeductions,
    advanceDeductions,
    violationDeductions,
    totalDeductions,
    currentBalance,
    advances: advances.map(a => ({ id: a.id, amount: a.amount, reason: a.reason, requestedAt: a.requestedAt })),
    violations: violations.map(v => ({ id: v.id, reason: v.reason, amount: v.amount })),
  });
});

export default router;
