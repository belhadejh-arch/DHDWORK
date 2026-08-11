import { Router, type IRouter } from "express";
import { db, salariesTable, employeesTable, officesTable, attendanceTable, advancesTable, violationsTable, notificationsTable, bonusesTable } from "@workspace/db";
import { leaveRequestsTable, vacationRequestsTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, gte, lte, inArray, sql } from "drizzle-orm";
import {
  ListSalariesQueryParams,
  GenerateSalariesBody,
  GetSalaryParams,
  PaySalaryParams,
  PostponeSalaryParams,
  PostponeSalaryBody,
  GetSalaryPayslipParams,
  ListSalariesResponse,
  GenerateSalariesResponse,
  GetSalaryResponse,
  PaySalaryResponse,
  PostponeSalaryResponse,
  GetSalaryPayslipResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { isEmployeeWorkDay } from "../lib/time";

const router: IRouter = Router();

async function enrichSalary(s: typeof salariesTable.$inferSelect) {
  const [emp] = await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName, officeId: employeesTable.officeId })
    .from(employeesTable).where(eq(employeesTable.id, s.employeeId));
  const [office] = emp ? await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId)) : [];
  return {
    ...s,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null,
    officeId: emp?.officeId ?? null,
    officeName: office?.name ?? null,
  };
}

// Helper: compute next payment date for an employee
function computeNextPaymentDate(paymentDay: number): { nextDate: Date; daysRemaining: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getDate();
  
  let nextDate: Date;
  if (currentDay < paymentDay) {
    nextDate = new Date(today.getFullYear(), today.getMonth(), paymentDay);
  } else {
    nextDate = new Date(today.getFullYear(), today.getMonth() + 1, paymentDay);
  }
  
  const daysRemaining = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return { nextDate, daysRemaining };
}

// ── GET /salaries/upcoming ─────────────────────────────────────────────────
// Returns all active employees with their upcoming payment dates + current month salary status
router.get("/salaries/upcoming", requireAuth, async (req, res): Promise<void> => {
  const today = new Date();
  const currentMonth = (today.getMonth() + 1).toString().padStart(2, '0');
  const currentYear = today.getFullYear();

  const employees = await db.select({
    id: employeesTable.id,
    firstName: employeesTable.firstName,
    lastName: employeesTable.lastName,
    officeId: employeesTable.officeId,
    baseSalary: employeesTable.baseSalary,
    paymentDay: employeesTable.paymentDay,
  })
  .from(employeesTable)
  .where(and(eq(employeesTable.isActive, true), isNull(employeesTable.deletedAt)));

  if (employees.length === 0) { res.json([]); return; }

  const offices = await db.select().from(officesTable);
  const officeMap = new Map(offices.map(o => [o.id, o.name]));

  // Get all salary records for current month
  const monthSalaries = await db.select().from(salariesTable)
    .where(and(eq(salariesTable.month, currentMonth), eq(salariesTable.year, currentYear)));
  const salaryByEmployee = new Map(monthSalaries.map(s => [s.employeeId, s]));

  const result = employees.map(emp => {
    const payDay = emp.paymentDay ?? 25;
    const { nextDate, daysRemaining } = computeNextPaymentDate(payDay);
    const salary = salaryByEmployee.get(emp.id);
    
    return {
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      officeId: emp.officeId,
      officeName: officeMap.get(emp.officeId) ?? null,
      paymentDay: payDay,
      nextPaymentDate: nextDate.toISOString().split('T')[0],
      daysRemaining,
      currentMonth,
      currentYear,
      salaryId: salary?.id ?? null,
      salaryStatus: salary?.status ?? null,
      finalSalary: salary?.finalSalary ?? null,
      baseSalary: emp.baseSalary,
    };
  });

  result.sort((a, b) => a.daysRemaining - b.daysRemaining);
  res.json(result);
});

// ── GET /salaries/preview ──────────────────────────────────────────────────
// Compute salary breakdown for an employee without saving
router.get("/salaries/preview", requireAuth, async (req, res): Promise<void> => {
  const employeeId = parseInt(req.query.employeeId as string);
  const month = req.query.month as string; // "08"
  const year = parseInt(req.query.year as string);
  
  if (!employeeId || !month || !year) {
    res.status(400).json({ error: "employeeId, month, year required" });
    return;
  }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

  const monthStr = `${year}-${month}`; // "2026-08" for filtering attendance dates

  // Attendance for the month
  const allAttendance = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, employeeId));
  const monthRecords = allAttendance.filter(r => r.date.startsWith(monthStr));

  const presentDays = monthRecords.filter(r => !r.isAbsent && r.checkInTime).length;
  const absentDays = monthRecords.filter(r => r.isAbsent && isEmployeeWorkDay(emp.workDays, r.date)).length;
  const workedHours = monthRecords.reduce((s, r) => s + (r.workedMinutes ?? 0) / 60, 0);
  const overtimeHours = monthRecords.reduce((s, r) => s + (r.overtimeMinutes ?? 0) / 60, 0);
  const overtimeBonus = monthRecords.reduce((s, r) => s + (r.overtimeBonus ?? 0), 0);
  const lateDeductions = monthRecords.reduce((s, r) => s + (r.lateDeduction ?? 0), 0);
  const lateDays = monthRecords.filter(r => (r.lateMinutes ?? 0) > 0 && !r.isAbsent).length;

  // Approved advances not yet deducted in a previous salary
  const advances = await db.select().from(advancesTable)
    .where(and(eq(advancesTable.employeeId, employeeId), eq(advancesTable.status, "approved"), isNull(advancesTable.salaryId)));
  const advanceDeductions = advances.reduce((s, a) => s + a.amount, 0);

  // Pending violations with amount
  const violations = await db.select().from(violationsTable)
    .where(and(eq(violationsTable.employeeId, employeeId), eq(violationsTable.status, "pending"), isNotNull(violationsTable.amount)));
  const violationDeductions = violations.reduce((s, v) => s + (v.amount ?? 0), 0);

  // Pending bonuses
  const pendingBonuses = await db.select().from(bonusesTable)
    .where(and(eq(bonusesTable.employeeId, employeeId), eq(bonusesTable.status, "pending")));
  const totalBonuses = pendingBonuses.reduce((s, b) => s + b.amount, 0);

  const totalDeductions = lateDeductions + advanceDeductions + violationDeductions;
  const finalSalary = Math.max(0, emp.baseSalary + overtimeBonus + totalBonuses - totalDeductions);

  res.json({
    employeeId: emp.id,
    employeeName: `${emp.firstName} ${emp.lastName}`,
    month,
    year,
    baseSalary: emp.baseSalary,
    presentDays,
    absentDays,
    lateDays,
    workedHours,
    overtimeHours,
    overtimeBonus,
    lateDeductions,
    advanceDeductions,
    violationDeductions,
    otherDeductions: 0,
    bonuses: totalBonuses,
    totalDeductions,
    finalSalary,
    attendanceRecords: monthRecords,
    advances,
    violations,
    pendingBonuses,
  });
});

// ── GET /salaries ──────────────────────────────────────────────────────────
router.get("/salaries", requireAuth, async (req, res): Promise<void> => {
  const query = ListSalariesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let rows = await db.select({
    id: salariesTable.id,
    employeeId: salariesTable.employeeId,
    employeeName: sql<string>`concat(${employeesTable.firstName}, ' ', ${employeesTable.lastName})`,
    officeId: employeesTable.officeId,
    officeName: officesTable.name,
    month: salariesTable.month,
    year: salariesTable.year,
    baseSalary: salariesTable.baseSalary,
    presentDays: salariesTable.presentDays,
    absentDays: salariesTable.absentDays,
    workedHours: salariesTable.workedHours,
    overtimeHours: salariesTable.overtimeHours,
    overtimeBonus: salariesTable.overtimeBonus,
    lateDeductions: salariesTable.lateDeductions,
    advanceDeductions: salariesTable.advanceDeductions,
    otherDeductions: salariesTable.otherDeductions,
    violationDeductions: salariesTable.violationDeductions,
    bonuses: salariesTable.bonuses,
    finalSalary: salariesTable.finalSalary,
    status: salariesTable.status,
    paidAt: salariesTable.paidAt,
    postponedUntil: salariesTable.postponedUntil,
    createdAt: salariesTable.createdAt,
  })
  .from(salariesTable)
  .leftJoin(employeesTable, eq(salariesTable.employeeId, employeesTable.id))
  .leftJoin(officesTable, eq(employeesTable.officeId, officesTable.id))
  .orderBy(salariesTable.year, salariesTable.month);

  const { employeeId, officeId, month, year, status } = query.data;
  if (employeeId) rows = rows.filter(r => r.employeeId === Number(employeeId));
  if (officeId) rows = rows.filter(r => r.officeId === Number(officeId));
  if (month) rows = rows.filter(r => r.month === month);
  if (year) rows = rows.filter(r => r.year === Number(year));
  if (status) rows = rows.filter(r => r.status === status);

  res.json(ListSalariesResponse.parse(rows));
});

// ── POST /salaries ─────────────────────────────────────────────────────────
router.post("/salaries", requireAuth, async (req, res): Promise<void> => {
  const body = GenerateSalariesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { month, year, officeId } = body.data;
  const monthStr = `${year}-${month}`;

  let employees = await db.select().from(employeesTable).where(and(eq(employeesTable.isActive, true), isNull(employeesTable.deletedAt)));
  if (officeId) employees = employees.filter(e => e.officeId === officeId);

  const generated = [];
  for (const emp of employees) {
    const existing = await db.select().from(salariesTable)
      .where(and(eq(salariesTable.employeeId, emp.id), eq(salariesTable.month, month), eq(salariesTable.year, year)));
    if (existing.length > 0) continue;

    const attendance = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, emp.id));
    const monthRecords = attendance.filter(r => r.date.startsWith(monthStr));

    const presentDays = monthRecords.filter(r => !r.isAbsent && r.checkInTime).length;
    const absentDays = monthRecords.filter(r => r.isAbsent && isEmployeeWorkDay(emp.workDays, r.date)).length;
    const workedHours = monthRecords.reduce((s, r) => s + (r.workedMinutes ?? 0) / 60, 0);
    const overtimeHours = monthRecords.reduce((s, r) => s + (r.overtimeMinutes ?? 0) / 60, 0);
    const overtimeBonus = monthRecords.reduce((s, r) => s + (r.overtimeBonus ?? 0), 0);
    const lateDeductions = monthRecords.reduce((s, r) => s + (r.lateDeduction ?? 0), 0);

    const advances = await db.select().from(advancesTable)
      .where(and(eq(advancesTable.employeeId, emp.id), eq(advancesTable.status, "approved"), isNull(advancesTable.salaryId)));
    const advanceDeductions = advances.reduce((s, a) => s + a.amount, 0);

    const violations = await db.select().from(violationsTable)
      .where(and(eq(violationsTable.employeeId, emp.id), eq(violationsTable.status, "pending"), isNotNull(violationsTable.amount)));
    const violationDeductions = violations.reduce((s, v) => s + (v.amount ?? 0), 0);

    const bonusList = await db.select().from(bonusesTable)
      .where(and(eq(bonusesTable.employeeId, emp.id), eq(bonusesTable.status, "pending")));
    const bonusTotal = bonusList.reduce((s, b) => s + b.amount, 0);

    const finalSalary = emp.baseSalary + overtimeBonus + bonusTotal - lateDeductions - advanceDeductions - violationDeductions;

    const [salary] = await db.insert(salariesTable).values({
      employeeId: emp.id,
      month,
      year,
      baseSalary: emp.baseSalary,
      presentDays,
      absentDays,
      workedHours,
      overtimeHours,
      overtimeBonus,
      lateDeductions,
      advanceDeductions,
      otherDeductions: 0,
      violationDeductions,
      bonuses: bonusTotal,
      finalSalary: Math.max(0, finalSalary),
      status: "pending",
    }).returning();

    // Mark advances as deducted in this salary to prevent double-deduction
    if (advances.length > 0) {
      await db.update(advancesTable)
        .set({ salaryId: salary.id })
        .where(inArray(advancesTable.id, advances.map(a => a.id)));
    }

    for (const v of violations) {
      await db.update(violationsTable)
        .set({ status: "deducted", salaryId: salary.id, updatedAt: new Date() })
        .where(eq(violationsTable.id, v.id));
    }

    for (const b of bonusList) {
      await db.update(bonusesTable)
        .set({ status: "applied", salaryId: salary.id })
        .where(eq(bonusesTable.id, b.id));
    }

    generated.push(await enrichSalary(salary));
  }

  res.status(201).json(GenerateSalariesResponse.parse(generated));
});

// ── POST /salaries/single ─────────────────────────────────────────────────
// Generate salary for a single employee
router.post("/salaries/single", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, month, year } = req.body;
  if (!employeeId || !month || !year) {
    res.status(400).json({ error: "employeeId, month, year required" });
    return;
  }
  const monthStr = `${year}-${month}`;

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) { res.status(404).json({ error: "الموظف غير موجود" }); return; }
  if (emp.deletedAt !== null || emp.isActive === false) {
    res.status(400).json({ error: "لا يمكن تجهيز راتب موظف غير نشط أو موقف عن العمل" });
    return;
  }

  const existing = await db.select().from(salariesTable)
    .where(and(eq(salariesTable.employeeId, employeeId), eq(salariesTable.month, month), eq(salariesTable.year, year)));
  if (existing.length > 0) {
    res.status(409).json({ error: "Salary already exists for this period", salary: await enrichSalary(existing[0]) });
    return;
  }

  const attendance = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, employeeId));
  const monthRecords = attendance.filter(r => r.date.startsWith(monthStr));

  const presentDays = monthRecords.filter(r => !r.isAbsent && r.checkInTime).length;
  const absentDays = monthRecords.filter(r => r.isAbsent && isEmployeeWorkDay(emp.workDays, r.date)).length;
  const workedHours = monthRecords.reduce((s, r) => s + (r.workedMinutes ?? 0) / 60, 0);
  const overtimeHours = monthRecords.reduce((s, r) => s + (r.overtimeMinutes ?? 0) / 60, 0);
  const overtimeBonus = monthRecords.reduce((s, r) => s + (r.overtimeBonus ?? 0), 0);
  const lateDeductions = monthRecords.reduce((s, r) => s + (r.lateDeduction ?? 0), 0);

  const advances = await db.select().from(advancesTable)
    .where(and(eq(advancesTable.employeeId, employeeId), eq(advancesTable.status, "approved"), isNull(advancesTable.salaryId)));
  const advanceDeductions = advances.reduce((s, a) => s + a.amount, 0);

  const violations = await db.select().from(violationsTable)
    .where(and(eq(violationsTable.employeeId, employeeId), eq(violationsTable.status, "pending"), isNotNull(violationsTable.amount)));
  const violationDeductions = violations.reduce((s, v) => s + (v.amount ?? 0), 0);

  const bonusList = await db.select().from(bonusesTable)
    .where(and(eq(bonusesTable.employeeId, employeeId), eq(bonusesTable.status, "pending")));
  const bonusTotal = bonusList.reduce((s, b) => s + b.amount, 0);

  const finalSalary = emp.baseSalary + overtimeBonus + bonusTotal - lateDeductions - advanceDeductions - violationDeductions;

  const [salary] = await db.insert(salariesTable).values({
    employeeId: emp.id,
    month,
    year,
    baseSalary: emp.baseSalary,
    presentDays,
    absentDays,
    workedHours,
    overtimeHours,
    overtimeBonus,
    lateDeductions,
    advanceDeductions,
    otherDeductions: 0,
    violationDeductions,
    bonuses: bonusTotal,
    finalSalary: Math.max(0, finalSalary),
    status: "pending",
  }).returning();

  // Mark advances as deducted in this salary to prevent double-deduction
  if (advances.length > 0) {
    await db.update(advancesTable)
      .set({ salaryId: salary.id })
      .where(inArray(advancesTable.id, advances.map(a => a.id)));
  }

  for (const v of violations) {
    await db.update(violationsTable)
      .set({ status: "deducted", salaryId: salary.id, updatedAt: new Date() })
      .where(eq(violationsTable.id, v.id));
  }

  for (const b of bonusList) {
    await db.update(bonusesTable)
      .set({ status: "applied", salaryId: salary.id })
      .where(eq(bonusesTable.id, b.id));
  }

  res.status(201).json(await enrichSalary(salary));
});

// ── GET /salaries/:id ──────────────────────────────────────────────────────
router.get("/salaries/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSalaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [salary] = await db.select().from(salariesTable).where(eq(salariesTable.id, params.data.id));
  if (!salary) {
    res.status(404).json({ error: "Salary not found" });
    return;
  }
  res.json(GetSalaryResponse.parse(await enrichSalary(salary)));
});

// ── PATCH /salaries/:id/pay ────────────────────────────────────────────────
router.patch("/salaries/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const params = PaySalaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Guard: only pay non-paid salaries to prevent duplicate notifications
  const [existing] = await db.select().from(salariesTable).where(eq(salariesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Salary not found" });
    return;
  }
  if (existing.status === "paid") {
    res.json(PaySalaryResponse.parse(await enrichSalary(existing)));
    return;
  }
  const paidAt = new Date();
  const [salary] = await db.update(salariesTable)
    .set({ status: "paid", paidAt, postponedUntil: null })
    .where(eq(salariesTable.id, params.data.id))
    .returning();
  if (!salary) {
    res.status(404).json({ error: "Salary not found" });
    return;
  }

  // Send notification to employee
  const paidAtStr = paidAt.toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });
  await db.insert(notificationsTable).values({
    type: "salary_paid",
    message: `تم تحويل راتبك لشهر ${salary.month}/${salary.year} — المبلغ: ${salary.finalSalary.toLocaleString()} دج — تاريخ الدفع: ${paidAtStr}`,
    recipientType: "employee",
    recipientEmployeeId: salary.employeeId,
    referenceId: salary.id,
    referenceType: "salary",
  });

  // Notify admin (confirmation)
  await db.insert(notificationsTable).values({
    type: "salary_paid",
    message: `تم تسجيل دفع راتب الموظف #${salary.employeeId} لشهر ${salary.month}/${salary.year} — المبلغ: ${salary.finalSalary.toLocaleString()} دج`,
    recipientType: "admin",
    referenceId: salary.id,
    referenceType: "salary",
  });

  res.json(PaySalaryResponse.parse(await enrichSalary(salary)));
});

// ── PATCH /salaries/:id/postpone ──────────────────────────────────────────
router.patch("/salaries/:id/postpone", requireAuth, async (req, res): Promise<void> => {
  const params = PostponeSalaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = PostponeSalaryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const postponedUntil = new Date();
  postponedUntil.setDate(postponedUntil.getDate() + body.data.days);
  const [salary] = await db.update(salariesTable)
    .set({ status: "postponed", postponedUntil })
    .where(eq(salariesTable.id, params.data.id))
    .returning();
  if (!salary) {
    res.status(404).json({ error: "Salary not found" });
    return;
  }
  res.json(PostponeSalaryResponse.parse(await enrichSalary(salary)));
});

// ── GET /salaries/:id/payslip ──────────────────────────────────────────────
router.get("/salaries/:id/payslip", requireAuth, async (req, res): Promise<void> => {
  const params = GetSalaryPayslipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [salary] = await db.select().from(salariesTable).where(eq(salariesTable.id, params.data.id));
  if (!salary) {
    res.status(404).json({ error: "Salary not found" });
    return;
  }
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, salary.employeeId));
  const [office] = emp ? await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId)) : [];

  // Detailed records for the payslip
  const monthStr = `${salary.year}-${salary.month}`;
  const allAttendance = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, salary.employeeId));
  const attendanceRecords = allAttendance.filter(r => r.date.startsWith(monthStr));

  // Only show advances actually linked to this salary (avoids showing advances from other months)
  const advances = await db.select().from(advancesTable)
    .where(and(eq(advancesTable.employeeId, salary.employeeId), eq(advancesTable.salaryId, salary.id)));

  const violations = await db.select().from(violationsTable)
    .where(and(eq(violationsTable.employeeId, salary.employeeId), eq(violationsTable.salaryId, salary.id)));

  const appliedBonuses = await db.select().from(bonusesTable)
    .where(and(eq(bonusesTable.employeeId, salary.employeeId), eq(bonusesTable.salaryId, salary.id)));

  // Leave & vacation requests overlapping with this month
  const monthStart = `${salary.year}-${salary.month}-01`;
  const monthEndDate = new Date(salary.year, parseInt(salary.month), 0);
  const monthEnd = monthEndDate.toISOString().split('T')[0];

  const leaveRequests = await db.select().from(leaveRequestsTable)
    .where(and(
      eq(leaveRequestsTable.employeeId, salary.employeeId),
      eq(leaveRequestsTable.status, "approved"),
      lte(leaveRequestsTable.startDate, monthEnd),
      gte(leaveRequestsTable.endDate, monthStart),
    ));

  const vacationRequests = await db.select().from(vacationRequestsTable)
    .where(and(
      eq(vacationRequestsTable.employeeId, salary.employeeId),
      eq(vacationRequestsTable.status, "approved"),
      lte(vacationRequestsTable.startDate, monthEnd),
      gte(vacationRequestsTable.endDate, monthStart),
    ));

  const { passwordHash: _ph, qrCodeData: _qr, ...empSafe } = emp ?? { passwordHash: '', qrCodeData: '' };

  res.json({
    salary: await enrichSalary(salary),
    employee: { ...empSafe, officeName: office?.name ?? null },
    office: office ?? null,
    companyName: "DHD Livraison",
    companyLogo: null,
    attendanceRecords: attendanceRecords.sort((a, b) => a.date.localeCompare(b.date)),
    advances,
    violations,
    leaveRequests,
    vacationRequests,
    bonuses: appliedBonuses,
  });
});

export default router;
