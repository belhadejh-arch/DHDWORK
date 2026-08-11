import { Router, type IRouter } from "express";
import { db, attendanceTable, employeesTable, officesTable, settingsTable } from "@workspace/db";
import { eq, and, like, sql } from "drizzle-orm";
import {
  ListAttendanceQueryParams,
  CheckInBody,
  CheckOutBody,
  GetAttendanceRecordParams,
  UpdateAttendanceRecordParams,
  UpdateAttendanceRecordBody,
  ListAttendanceResponse,
  CheckInResponse,
  CheckOutResponse,
  GetAttendanceRecordResponse,
  UpdateAttendanceRecordResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { validateQrToken } from "./offices";
import { haversineDistance, OFFICE_COORDINATES, MAX_ATTENDANCE_RADIUS_METERS } from "../lib/gps";
import { getDeductionSettings, calculateLateDeduction, recordLateDeduction, recordAbsenceDeduction } from "../lib/payroll-helpers";
import { isEmployeeWorkDay } from "../lib/time";

const router: IRouter = Router();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

async function enrichRecord(r: typeof attendanceTable.$inferSelect) {
  const [emp] = await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName })
    .from(employeesTable).where(eq(employeesTable.id, r.employeeId));
  const [off] = await db.select({ name: officesTable.name }).from(officesTable).where(eq(officesTable.id, r.officeId));
  return {
    ...r,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null,
    officeName: off?.name ?? null,
  };
}

router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const query = ListAttendanceQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { employeeId, officeId, date, month, year } = query.data;

  // Build WHERE conditions at the DB level — avoids fetching the entire table.
  // The `date` column is a PostgreSQL DATE type; use explicit text cast for
  // prefix-matching (LIKE on DATE requires a cast in PG).
  const conditions = [];
  if (employeeId) conditions.push(eq(attendanceTable.employeeId, Number(employeeId)));
  if (officeId)   conditions.push(eq(attendanceTable.officeId, Number(officeId)));
  if (date)       conditions.push(eq(attendanceTable.date, date));
  else if (month) conditions.push(sql`${attendanceTable.date}::text like ${month + '%'}`);
  else if (year)  conditions.push(sql`${attendanceTable.date}::text like ${String(year) + '%'}`);

  const records = await db
    .select({
      id: attendanceTable.id,
      employeeId: attendanceTable.employeeId,
      employeeName: sql<string>`concat(${employeesTable.firstName}, ' ', ${employeesTable.lastName})`,
      officeId: attendanceTable.officeId,
      officeName: officesTable.name,
      date: attendanceTable.date,
      checkInTime: attendanceTable.checkInTime,
      checkOutTime: attendanceTable.checkOutTime,
      checkInLat: attendanceTable.checkInLat,
      checkInLng: attendanceTable.checkInLng,
      checkOutLat: attendanceTable.checkOutLat,
      checkOutLng: attendanceTable.checkOutLng,
      workedMinutes: attendanceTable.workedMinutes,
      lateMinutes: attendanceTable.lateMinutes,
      overtimeMinutes: attendanceTable.overtimeMinutes,
      lateDeduction: attendanceTable.lateDeduction,
      overtimeBonus: attendanceTable.overtimeBonus,
      isAbsent: attendanceTable.isAbsent,
      notes: attendanceTable.notes,
      createdAt: attendanceTable.createdAt,
    })
    .from(attendanceTable)
    .leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
    .leftJoin(officesTable, eq(attendanceTable.officeId, officesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(attendanceTable.date);

  res.json(ListAttendanceResponse.parse(records));
});

router.post("/attendance/checkin", requireAuth, async (req, res): Promise<void> => {
  const parsed = CheckInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { employeeId, qrToken, latitude, longitude } = parsed.data;

  // Validate QR token
  const tokenOfficeId = await validateQrToken(qrToken);
  if (!tokenOfficeId) {
    res.status(400).json({ error: "Invalid or expired QR code" });
    return;
  }

  // Get employee and check they belong to the right office
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) {
    res.status(400).json({ error: "Employee not found" });
    return;
  }
  if (emp.officeId !== tokenOfficeId) {
    res.status(400).json({ error: "Employee does not belong to this office" });
    return;
  }

  // Validate GPS distance
  const coords = OFFICE_COORDINATES[tokenOfficeId];
  if (!coords) {
    res.status(400).json({ error: "Office GPS coordinates not found" });
    return;
  }
  const distance = haversineDistance(latitude, longitude, coords.lat, coords.lng);
  if (distance > MAX_ATTENDANCE_RADIUS_METERS) {
    res.status(400).json({ error: `You are ${Math.round(distance)}m away from the office. Must be within ${MAX_ATTENDANCE_RADIUS_METERS}m.` });
    return;
  }

  // Check if already checked in today
  const today = todayStr();
  const [existing] = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, employeeId), eq(attendanceTable.date, today)));
  if (existing?.checkInTime) {
    res.status(400).json({ error: "Already checked in today" });
    return;
  }

  const settings = await getDeductionSettings();

  const checkInTime = nowTimeStr();
  const expectedStart = timeToMinutes(emp.workStartTime);
  const actualStart = timeToMinutes(checkInTime);
  const lateMinutes = emp.isUnrestricted ? 0 : Math.max(0, actualStart - expectedStart);
  const lateDeduction = calculateLateDeduction(lateMinutes, settings, emp.isUnrestricted);

  if (lateDeduction > 0) {
    await recordLateDeduction(employeeId, today, lateMinutes, lateDeduction);
  }

  let record: typeof attendanceTable.$inferSelect;
  if (existing) {
    const [updated] = await db.update(attendanceTable)
      .set({ checkInTime, checkInLat: latitude, checkInLng: longitude, lateMinutes, lateDeduction })
      .where(eq(attendanceTable.id, existing.id))
      .returning();
    record = updated;
  } else {
    const [inserted] = await db.insert(attendanceTable).values({
      employeeId,
      officeId: tokenOfficeId,
      date: today,
      checkInTime,
      checkInLat: latitude,
      checkInLng: longitude,
      lateMinutes,
      lateDeduction,
    }).returning();
    record = inserted;
  }

  res.status(201).json(CheckInResponse.parse(await enrichRecord(record)));
});

router.post("/attendance/checkout", requireAuth, async (req, res): Promise<void> => {
  const parsed = CheckOutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { employeeId, qrToken, latitude, longitude } = parsed.data;

  const tokenOfficeId = await validateQrToken(qrToken);
  if (!tokenOfficeId) {
    res.status(400).json({ error: "Invalid or expired QR code" });
    return;
  }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp || emp.officeId !== tokenOfficeId) {
    res.status(400).json({ error: "Employee does not belong to this office" });
    return;
  }

  const coords = OFFICE_COORDINATES[tokenOfficeId];
  if (!coords) {
    res.status(400).json({ error: "Office GPS coordinates not found" });
    return;
  }
  const distance = haversineDistance(latitude, longitude, coords.lat, coords.lng);
  if (distance > MAX_ATTENDANCE_RADIUS_METERS) {
    res.status(400).json({ error: `You are ${Math.round(distance)}m away from the office. Must be within ${MAX_ATTENDANCE_RADIUS_METERS}m.` });
    return;
  }

  const today = todayStr();
  const [existing] = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, employeeId), eq(attendanceTable.date, today)));
  if (!existing?.checkInTime) {
    res.status(400).json({ error: "Must check in first" });
    return;
  }
  if (existing.checkOutTime) {
    res.status(400).json({ error: "Already checked out today" });
    return;
  }

  const [settings] = await db.select().from(settingsTable).limit(1);
  const overtimeHourlyRate = settings?.overtimeHourlyRate ?? 200;

  const checkOutTime = nowTimeStr();
  const checkInMinutes = timeToMinutes(existing.checkInTime);
  const checkOutMinutes = timeToMinutes(checkOutTime);
  const workedMinutes = Math.max(0, checkOutMinutes - checkInMinutes);

  const expectedEnd = timeToMinutes(emp.workEndTime);
  const overtimeMinutes = Math.max(0, checkOutMinutes - expectedEnd);
  const overtimeBonus = (overtimeMinutes / 60) * overtimeHourlyRate;

  const [updated] = await db.update(attendanceTable)
    .set({ checkOutTime, checkOutLat: latitude, checkOutLng: longitude, workedMinutes, overtimeMinutes, overtimeBonus })
    .where(eq(attendanceTable.id, existing.id))
    .returning();

  res.json(CheckOutResponse.parse(await enrichRecord(updated)));
});

router.get("/attendance/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetAttendanceRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [record] = await db.select().from(attendanceTable).where(eq(attendanceTable.id, params.data.id));
  if (!record) {
    res.status(404).json({ error: "Attendance record not found" });
    return;
  }
  res.json(GetAttendanceRecordResponse.parse(await enrichRecord(record)));
});

router.patch("/attendance/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateAttendanceRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateAttendanceRecordBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // Load existing record + employee + settings to recalculate derived fields when times change
  const [existing] = await db.select().from(attendanceTable).where(eq(attendanceTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  const updateData: Partial<typeof attendanceTable.$inferInsert> = { ...body.data };

  const newCheckIn  = body.data.checkInTime  ?? existing.checkInTime;
  const newCheckOut = body.data.checkOutTime ?? existing.checkOutTime;
  const isAbsent    = body.data.isAbsent     ?? existing.isAbsent;

  // Recalculate derived fields whenever a time field is present in the patch
  if ((body.data.checkInTime !== undefined || body.data.checkOutTime !== undefined) && !isAbsent) {
    const [[emp], settings] = await Promise.all([
      db.select().from(employeesTable).where(eq(employeesTable.id, existing.employeeId)),
      getDeductionSettings(),
    ]);

    const overtimeHourlyRate = settings.overtimeHourlyRate;

    if (newCheckIn && emp) {
      const expectedStart = timeToMinutes(emp.workStartTime);
      const actualStart   = timeToMinutes(newCheckIn);
      const lateMinutes   = emp.isUnrestricted ? 0 : Math.max(0, actualStart - expectedStart);
      const lateDeduction = calculateLateDeduction(lateMinutes, settings, emp.isUnrestricted);
      updateData.lateMinutes  = lateMinutes;
      updateData.lateDeduction = lateDeduction;
    }

    if (newCheckIn && newCheckOut && emp) {
      const checkInMins   = timeToMinutes(newCheckIn);
      const checkOutMins  = timeToMinutes(newCheckOut);
      const workedMinutes = Math.max(0, checkOutMins - checkInMins);
      const expectedEnd   = timeToMinutes(emp.workEndTime);
      const overtimeMinutes = Math.max(0, checkOutMins - expectedEnd);
      const overtimeBonus   = (overtimeMinutes / 60) * overtimeHourlyRate;
      updateData.workedMinutes   = workedMinutes;
      updateData.overtimeMinutes = overtimeMinutes;
      updateData.overtimeBonus   = overtimeBonus;
    }
  }

  // If marking absent, zero out all derived time fields and trigger absence deduction if it's a work day
  if (isAbsent && !existing.isAbsent) {
    updateData.workedMinutes   = 0;
    updateData.lateMinutes     = 0;
    updateData.overtimeMinutes = 0;
    updateData.lateDeduction   = 0;
    updateData.overtimeBonus   = 0;

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, existing.employeeId));
    if (!emp || isEmployeeWorkDay(emp.workDays, existing.date)) {
      await recordAbsenceDeduction(existing.employeeId, existing.date);
    }
  }

  const [updated] = await db.update(attendanceTable).set(updateData).where(eq(attendanceTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  res.json(UpdateAttendanceRecordResponse.parse(await enrichRecord(updated)));
});

export default router;
