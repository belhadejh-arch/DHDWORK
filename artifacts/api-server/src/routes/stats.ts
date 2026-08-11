import { Router, type IRouter } from "express";
import { db, employeesTable, attendanceTable, salariesTable, advancesTable, leaveRequestsTable, vacationRequestsTable, officesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import {
  GetDashboardStatsQueryParams,
  GetOfficeStatsQueryParams,
  GetAttendanceChartQueryParams,
  GetSalaryChartQueryParams,
  GetDashboardStatsResponse,
  GetOfficeStatsResponse,
  GetAttendanceChartResponse,
  GetSalaryChartResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { todayStr, isEmployeeWorkDay } from "../lib/time";

const router: IRouter = Router();

// ── Optimised dashboard endpoint ──────────────────────────────────────────────
// Fetches ALL data in ONE parallel batch, then groups/filters in memory.
// Eliminates the N+1 problem (was: 4 DB calls per office).
router.get("/stats/dashboard", requireAuth, async (req, res): Promise<void> => {
  const query = GetDashboardStatsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { month, year } = query.data;

  const today = todayStr();

  // Fetch everything in parallel — single round-trip per table
  const [
    employees,
    todayAttendance,
    pendingAdvances,
    pendingLeaves,
    pendingVacations,
    allSalaries,
    approvedAdvances,
    offices,
  ] = await Promise.all([
    db.select().from(employeesTable).where(eq(employeesTable.isActive, true)),
    db.select().from(attendanceTable).where(eq(attendanceTable.date, today)),
    db.select().from(advancesTable).where(eq(advancesTable.status, "pending")),
    db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.status, "pending")),
    db.select().from(vacationRequestsTable).where(eq(vacationRequestsTable.status, "pending")),
    db.select().from(salariesTable),
    db.select().from(advancesTable).where(eq(advancesTable.status, "approved")),
    db.select().from(officesTable),
  ]);

  // Today attendance stats (global)
  const empMap = new Map(employees.map(e => [e.id, e]));
  const activeEmployeeIds = new Set(employees.map(e => e.id));
  const activeTodayAttendance = todayAttendance.filter(r => activeEmployeeIds.has(r.employeeId));
  const presentToday = activeTodayAttendance.filter(r => !r.isAbsent && r.checkInTime).length;
  const absentToday  = activeTodayAttendance.filter(r => r.isAbsent && isEmployeeWorkDay(empMap.get(r.employeeId)?.workDays, today)).length;
  const lateToday    = activeTodayAttendance.filter(r => (r.lateMinutes ?? 0) > 0).length;

  // Month/year filter helper
  const matchesPeriod = (s: { month: string | number; year: number }) =>
    (!month || String(s.month) === String(month)) &&
    (!year  || s.year === Number(year));

  const monthSalaries = allSalaries.filter(matchesPeriod);
  const approvedAdvancesForPeriod = approvedAdvances.filter(a => {
    if (!month && !year) return true;
    if (!a.requestedAt) return false;
    const requested = new Date(a.requestedAt);
    return (!month || String(requested.getMonth() + 1).padStart(2, "0") === String(month).padStart(2, "0"))
      && (!year || requested.getFullYear() === Number(year));
  });

  // Build office breakdown entirely in-memory — no extra DB calls
  const empByOffice = new Map<number, typeof employees>();
  for (const e of employees) {
    if (!empByOffice.has(e.officeId)) empByOffice.set(e.officeId, []);
    empByOffice.get(e.officeId)!.push(e);
  }

  // Index today attendance and salaries by employeeId for O(1) lookup
  const attendanceByEmp = new Map<number, typeof todayAttendance[0]>();
  for (const r of todayAttendance) attendanceByEmp.set(r.employeeId, r);

  const salaryByEmp = new Map<number, typeof monthSalaries[0][]>();
  for (const s of monthSalaries) {
    if (!salaryByEmp.has(s.employeeId)) salaryByEmp.set(s.employeeId, []);
    salaryByEmp.get(s.employeeId)!.push(s);
  }

  const officeBreakdown = offices.map(o => {
    const offEmps = empByOffice.get(o.id) ?? [];
    const ids = new Set(offEmps.map(e => e.id));

    let present = 0, absent = 0, late = 0;
    for (const [id, r] of attendanceByEmp) {
      if (!ids.has(id)) continue;
      if (!r.isAbsent && r.checkInTime) present++;
      if (r.isAbsent && isEmployeeWorkDay(empMap.get(id)?.workDays, today)) absent++;
      if ((r.lateMinutes ?? 0) > 0) late++;
    }

    let totalSalaries = 0, totalDeductions = 0;
    for (const [id, sals] of salaryByEmp) {
      if (!ids.has(id)) continue;
      for (const s of sals) {
        totalSalaries  += s.finalSalary;
        totalDeductions += s.lateDeductions + s.advanceDeductions + s.violationDeductions + s.otherDeductions;
      }
    }

    const offAdvances = approvedAdvancesForPeriod.filter(a => ids.has(a.employeeId));
    const totalAdvances = offAdvances.reduce((acc, a) => acc + a.amount, 0);

    return {
      officeId: o.id,
      officeName: o.name ?? "",
      totalEmployees: offEmps.length,
      presentToday: present,
      absentToday: absent,
      lateToday: late,
      totalSalaries,
      totalDeductions,
      totalAdvances,
      overtimeHours: 0, // kept for schema compat; expensive to compute per office
    };
  });

  res.json(GetDashboardStatsResponse.parse({
    totalEmployees: employees.length,
    presentToday,
    absentToday,
    lateToday,
    pendingRequests: pendingAdvances.length + pendingLeaves.length + pendingVacations.length,
    pendingAdvances: pendingAdvances.length,
    pendingLeaves:   pendingLeaves.length,
    pendingVacations: pendingVacations.length,
    totalSalariesThisMonth:    monthSalaries.reduce((s, sal) => s + sal.finalSalary, 0),
     totalAdvancesThisMonth:    approvedAdvancesForPeriod.reduce((s, a) => s + a.amount, 0),
     totalDeductionsThisMonth:  monthSalaries.reduce((s, sal) => s + sal.lateDeductions + sal.advanceDeductions + sal.violationDeductions + sal.otherDeductions, 0),
    officeBreakdown,
  }));
});

// ── Single office stats ───────────────────────────────────────────────────────
router.get("/stats/office", requireAuth, async (req, res): Promise<void> => {
  const query = GetOfficeStatsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { officeId, month, year } = query.data;

  const today = todayStr();
  const oid = Number(officeId);

  const [office, employees, todayAttendance, allSalaries, allAdvances] = await Promise.all([
    db.select().from(officesTable).where(eq(officesTable.id, oid)),
    db.select().from(employeesTable).where(eq(employeesTable.officeId, oid)),
    db.select().from(attendanceTable).where(eq(attendanceTable.date, today)),
    db.select().from(salariesTable),
    db.select().from(advancesTable),
  ]);

  const ids = new Set(employees.map(e => e.id));
  const presentToday = todayAttendance.filter(r => ids.has(r.employeeId) && !r.isAbsent && r.checkInTime).length;
  const absentToday  = todayAttendance.filter(r => ids.has(r.employeeId) && r.isAbsent).length;
  const lateToday    = todayAttendance.filter(r => ids.has(r.employeeId) && (r.lateMinutes ?? 0) > 0).length;

  const monthSalaries = allSalaries.filter(s =>
    ids.has(s.employeeId) &&
    (!month || String(s.month) === String(month)) &&
    (!year  || s.year === Number(year))
  );
  const approvedAdvances = allAdvances.filter(a => ids.has(a.employeeId) && a.status === "approved");

  res.json(GetOfficeStatsResponse.parse({
    officeId: oid,
    officeName: office[0]?.name ?? "",
    totalEmployees: employees.length,
    presentToday,
    absentToday,
    lateToday,
    totalSalaries: monthSalaries.reduce((s, sal) => s + sal.finalSalary, 0),
    totalDeductions: monthSalaries.reduce((s, sal) => s + sal.lateDeductions + sal.advanceDeductions + sal.otherDeductions, 0),
    totalAdvances: approvedAdvances.reduce((s, a) => s + a.amount, 0),
    overtimeHours: 0,
  }));
});

// ── Attendance chart ──────────────────────────────────────────────────────────
router.get("/stats/attendance-chart", requireAuth, async (req, res): Promise<void> => {
  const query = GetAttendanceChartQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { month, year, officeId, period } = query.data;

  // Compute date range from period (7d / 30d), or fall back to month/year filter
  let startDate: string | null = null;
  if (period) {
    const days = period === "7d" ? 7 : 30;
    const d = new Date();
    d.setDate(d.getDate() - days + 1);
    startDate = d.toISOString().slice(0, 10);
  }

  const allAttendance = await db.select().from(attendanceTable);
  const filtered = allAttendance.filter(r => {
    if (startDate && r.date < startDate) return false;
    if (!startDate && month && !r.date.startsWith(month)) return false;
    if (!startDate && year  && !r.date.startsWith(String(year))) return false;
    if (officeId && r.officeId !== Number(officeId)) return false;
    return true;
  });

  // Group by date: count present, absent, late separately
  const byDate: Record<string, { present: number; absent: number; late: number }> = {};
  for (const r of filtered) {
    if (!byDate[r.date]) byDate[r.date] = { present: 0, absent: 0, late: 0 };
    if (r.isAbsent) {
      byDate[r.date].absent++;
    } else if (r.checkInTime) {
      byDate[r.date].present++;
      if ((r.lateMinutes ?? 0) > 0) byDate[r.date].late++;
    }
  }

  const data = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  res.json(GetAttendanceChartResponse.parse(data));
});

// ── Salary chart ──────────────────────────────────────────────────────────────
router.get("/stats/salary-chart", requireAuth, async (req, res): Promise<void> => {
  const query = GetSalaryChartQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { year, officeId } = query.data;

  const [employees, allSalaries] = await Promise.all([
    db.select().from(employeesTable),
    db.select().from(salariesTable),
  ]);

  const empIds = new Set(
    officeId
      ? employees.filter(e => e.officeId === Number(officeId)).map(e => e.id)
      : employees.map(e => e.id)
  );

  const filtered = allSalaries.filter(s =>
    empIds.has(s.employeeId) && (!year || s.year === Number(year))
  );

  const byMonth: Record<string, number> = {};
  for (const s of filtered) {
    byMonth[s.month] = (byMonth[s.month] ?? 0) + s.finalSalary;
  }

  const data = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totalSalaries]) => ({ month, totalSalaries }));

  res.json(GetSalaryChartResponse.parse(data));
});

export default router;
