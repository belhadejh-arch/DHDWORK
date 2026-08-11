import { Router, type IRouter } from "express";
import { db, employeesTable, officesTable, attendanceTable, salariesTable, advancesTable, violationsTable, transactionsTable, notificationsTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, like, or, sql, desc } from "drizzle-orm";
import {
  ListEmployeesQueryParams,
  GetEmployeeParams,
  UpdateEmployeeParams,
  DeleteEmployeeParams,
  GetEmployeeAttendanceSummaryQueryParams,
  GetEmployeeSalaryHistoryParams,
  GetEmployeeAttendanceSummaryResponse,
  GetEmployeeSalaryHistoryResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { hashPassword, generateUniqueSerialNumber, generateUniqueQrCodeData } from "../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

const EmployeeWriteSchema = z.object({
  officeId: z.coerce.number().int().positive(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().nullable(),
  position: z.string().min(1),
  hireDate: z.string().optional().nullable(),
  baseSalary: z.coerce.number().min(0),
  paymentDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  workStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  workEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  workDays: z.array(z.string()).optional(),
  isUnrestricted: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

function publicEmployee(emp: typeof employeesTable.$inferSelect, officeName: string | null) {
  const { passwordHash: _ph, qrCodeData: _qr, ...rest } = emp;
  return { ...rest, officeName };
}

// ─── List active employees (deletedAt IS NULL) ─────────────────────────────────
router.get("/employees", requireAuth, async (req, res): Promise<void> => {
  const query = ListEmployeesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  // Build WHERE conditions at the DB level — avoids loading the full table
  const conditions: ReturnType<typeof eq>[] = [isNull(employeesTable.deletedAt) as any];
  if (query.data.officeId) {
    conditions.push(eq(employeesTable.officeId, query.data.officeId) as any);
  }
  // Text search: push down multi-column ILIKE to the DB
  if (query.data.search) {
    const pattern = `%${query.data.search}%`;
    conditions.push(
      or(
        like(employeesTable.firstName, pattern),
        like(employeesTable.lastName, pattern),
        like(employeesTable.phone, pattern),
        like(employeesTable.serialNumber, pattern),
      ) as any
    );
  }

  const rows = await db
    .select({
      id: employeesTable.id,
      officeId: employeesTable.officeId,
      officeName: officesTable.name,
      firstName: employeesTable.firstName,
      lastName: employeesTable.lastName,
      phone: employeesTable.phone,
      email: employeesTable.email,
      position: employeesTable.position,
      baseSalary: employeesTable.baseSalary,
      workStartTime: employeesTable.workStartTime,
      workEndTime: employeesTable.workEndTime,
      workDays: employeesTable.workDays,
      isUnrestricted: employeesTable.isUnrestricted,
      isActive: employeesTable.isActive,
      serialNumber: employeesTable.serialNumber,
      hireDate: employeesTable.hireDate,
      paymentDay: employeesTable.paymentDay,
      createdAt: employeesTable.createdAt,
    })
    .from(employeesTable)
    .leftJoin(officesTable, eq(employeesTable.officeId, officesTable.id))
    .where(and(...conditions))
    .orderBy(employeesTable.id);

  res.json(rows);
});

// ─── Create employee ───────────────────────────────────────────────────────────
router.post("/employees", requireAuth, async (req, res): Promise<void> => {
  const parsed = EmployeeWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email ? parsed.data.email.toLowerCase().trim() : null;
  if (email) {
    const [dup] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.email, email));
    if (dup) {
      res.status(409).json({ error: "email_exists" });
      return;
    }
  }

  const serialNumber = await generateUniqueSerialNumber("EMP");
  const qrCodeData = await generateUniqueQrCodeData();

  const [emp] = await db.insert(employeesTable).values({
    officeId: parsed.data.officeId,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    phone: parsed.data.phone,
    email,
    position: parsed.data.position,
    hireDate: parsed.data.hireDate ?? null,
    baseSalary: parsed.data.baseSalary,
    paymentDay: parsed.data.paymentDay ?? null,
    workStartTime: parsed.data.workStartTime,
    workEndTime: parsed.data.workEndTime,
    workDays: parsed.data.workDays ?? ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"],
    isUnrestricted: parsed.data.isUnrestricted ?? false,
    isActive: parsed.data.isActive ?? true,
    serialNumber,
    qrCodeData,
  }).returning();

  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId));
  res.status(201).json(publicEmployee(emp, office?.name ?? null));
});

// ─── Seed 15 default employees ─────────────────────────────────────────────────
router.post("/employees/seed-defaults", requireAuth, async (req, res): Promise<void> => {
  try {
    const offices = await db.select().from(officesTable);
    if (offices.length === 0) {
      res.status(400).json({ error: "No offices found" });
      return;
    }

    const defaultNames = [
      ["أحمد", "بن علي"], ["محمد", "بلقاسم"], ["عمر", "بوزيد"],
      ["يوسف", "حمودة"], ["كريم", "مزيان"], ["سامي", "بوعكاز"],
      ["رضا", "صالحي"], ["وليد", "قاسمي"], ["أمين", "بوهلال"],
      ["إلياس", "درويش"], ["نور الدين", "شرقي"], ["فريد", "بلحاج"],
      ["حسام", "معمري"], ["مراد", "زروق"], ["بلال", "حمدان"],
    ];

    const created = [];
    for (let i = 0; i < defaultNames.length; i++) {
      const [firstName, lastName] = defaultNames[i];
      const office = offices[i % offices.length];
      const serialNumber = await generateUniqueSerialNumber("EMP");
      const qrCodeData = await generateUniqueQrCodeData();
      const [emp] = await db.insert(employeesTable).values({
        officeId: office.id,
        firstName,
        lastName,
        phone: `05${String(50000000 + i).padStart(8, "0")}`,
        email: null,
        position: "سائق توصيل",
        hireDate: "2024-01-01",
        baseSalary: 40000,
        workStartTime: "08:00",
        workEndTime: "17:00",
        isActive: true,
        serialNumber,
        qrCodeData,
      }).returning();
      const [office2] = await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId));
      created.push(publicEmployee(emp, office2?.name ?? null));
    }

    res.status(201).json({ created: created.length, employees: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Former employees (soft-deleted) ──────────────────────────────────────────
router.get("/employees/former", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: employeesTable.id,
      officeId: employeesTable.officeId,
      officeName: officesTable.name,
      firstName: employeesTable.firstName,
      lastName: employeesTable.lastName,
      phone: employeesTable.phone,
      email: employeesTable.email,
      position: employeesTable.position,
      baseSalary: employeesTable.baseSalary,
      workStartTime: employeesTable.workStartTime,
      workEndTime: employeesTable.workEndTime,
      isActive: employeesTable.isActive,
      serialNumber: employeesTable.serialNumber,
      createdAt: employeesTable.createdAt,
      deletedAt: employeesTable.deletedAt,
      deletionReason: employeesTable.deletionReason,
      hireDate: employeesTable.hireDate,
      paymentDay: employeesTable.paymentDay,
    })
    .from(employeesTable)
    .leftJoin(officesTable, eq(employeesTable.officeId, officesTable.id))
    .where(isNotNull(employeesTable.deletedAt))
    .orderBy(employeesTable.deletedAt);

  res.json(rows);
});

// ─── Restore former employee ───────────────────────────────────────────────────
router.post("/employees/:id/restore", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [emp] = await db.update(employeesTable)
    .set({ deletedAt: null, deletionReason: null, isActive: true })
    .where(and(eq(employeesTable.id, id), isNotNull(employeesTable.deletedAt)))
    .returning();

  if (!emp) { res.status(404).json({ error: "Former employee not found" }); return; }
  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId));
  res.json(publicEmployee(emp, office?.name ?? null));
});

// ─── Permanently delete former employee ───────────────────────────────────────
router.delete("/employees/:id/permanent", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [emp] = await db.delete(employeesTable)
    .where(and(eq(employeesTable.id, id), isNotNull(employeesTable.deletedAt)))
    .returning();

  if (!emp) { res.status(404).json({ error: "Former employee not found or not deleted" }); return; }
  res.sendStatus(204);
});

router.get("/employees/attendance-summary", requireAuth, async (req, res): Promise<void> => {
  const query = GetEmployeeAttendanceSummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { employeeId, month, year } = query.data;
  const empId = Number(employeeId);

  // Filter by month or year at the DB level to avoid loading the full history.
  // DATE columns need a text cast for LIKE prefix matching in PostgreSQL.
  const summaryConditions = [];
  summaryConditions.push(eq(attendanceTable.employeeId, empId));
  if (month) {
    summaryConditions.push(sql`${attendanceTable.date}::text like ${month + '%'}`);
  } else if (year) {
    summaryConditions.push(sql`${attendanceTable.date}::text like ${String(year) + '%'}`);
  }

  const filtered = await db.select().from(attendanceTable).where(and(...summaryConditions));

  const presentDays = filtered.filter(r => !r.isAbsent && r.checkInTime).length;
  const absentDays = filtered.filter(r => r.isAbsent).length;
  const lateDays = filtered.filter(r => (r.lateMinutes ?? 0) > 0).length;
  const totalHours = filtered.reduce((sum, r) => sum + (r.workedMinutes ?? 0) / 60, 0);
  const overtimeHours = filtered.reduce((sum, r) => sum + (r.overtimeMinutes ?? 0) / 60, 0);
  const totalDeductions = filtered.reduce((sum, r) => sum + (r.lateDeduction ?? 0), 0);
  const totalBonuses = filtered.reduce((sum, r) => sum + (r.overtimeBonus ?? 0), 0);

  res.json(GetEmployeeAttendanceSummaryResponse.parse({
    employeeId: empId,
    month: month ?? "",
    year: year ? Number(year) : new Date().getFullYear(),
    presentDays,
    absentDays,
    lateDays,
    totalHours,
    overtimeHours,
    totalDeductions,
    totalBonuses,
  }));
});

router.get("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(employeesTable)
    .leftJoin(officesTable, eq(employeesTable.officeId, officesTable.id))
    .where(eq(employeesTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const { passwordHash: _ph, qrCodeData: _qr, ...empPub } = row.employees;
  res.json({ ...empPub, officeName: row.offices?.name ?? null });
});

// ─── Get employee QR code data (admin only) ────────────────────────────────────
router.get("/employees/:id/qrcode", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json({ id: emp.id, serialNumber: emp.serialNumber, qrCodeData: emp.qrCodeData });
});

// ─── Regenerate employee QR code (admin only) ──────────────────────────────────
router.post("/employees/:id/qrcode/regenerate", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const newQr = await generateUniqueQrCodeData();
  const [emp] = await db.update(employeesTable).set({ qrCodeData: newQr }).where(eq(employeesTable.id, id)).returning();
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json({ id: emp.id, serialNumber: emp.serialNumber, qrCodeData: emp.qrCodeData });
});

router.patch("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = EmployeeWriteSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.email !== undefined) {
    const email = parsed.data.email ? parsed.data.email.toLowerCase().trim() : null;
    if (email) {
      const [dup] = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(eq(employeesTable.email, email));
      if (dup && dup.id !== params.data.id) {
        res.status(409).json({ error: "email_exists" });
        return;
      }
    }
    update.email = email;
  }
  delete (update as any).password;

  const [emp] = await db.update(employeesTable).set(update).where(eq(employeesTable.id, params.data.id)).returning();
  if (!emp) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId));
  res.json(publicEmployee(emp, office?.name ?? null));
});

// ─── Soft-delete employee (moves to Former Employees) ─────────────────────────
router.delete("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const reason = (req.body as any)?.reason ?? null;

  const [emp] = await db.update(employeesTable)
    .set({ deletedAt: new Date(), deletionReason: reason, isActive: false })
    .where(and(eq(employeesTable.id, params.data.id), isNull(employeesTable.deletedAt)))
    .returning();

  if (!emp) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/employees/:id/salary-history", requireAuth, async (req, res): Promise<void> => {
  const params = GetEmployeeSalaryHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const salaries = await db.select().from(salariesTable)
    .where(eq(salariesTable.employeeId, params.data.id))
    .orderBy(salariesTable.year, salariesTable.month);

  const [emp] = await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName, officeId: employeesTable.officeId })
    .from(employeesTable).where(eq(employeesTable.id, params.data.id));
  const [office] = emp ? await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId)) : [];

  const result = salaries.map(s => ({
    ...s,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null,
    officeId: emp?.officeId ?? null,
    officeName: office?.name ?? null,
  }));
  res.json(GetEmployeeSalaryHistoryResponse.parse(result));
});

// ── GET /employees/:id/transactions ──────────────────────────────────────────
router.get("/employees/:id/transactions", requireAuth, async (req, res): Promise<void> => {
  const empId = parseInt(String(req.params.id));
  if (!empId || isNaN(empId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.employeeId, empId))
    .orderBy(desc(transactionsTable.createdAt));

  res.json(rows);
});

// ── POST /employees/:id/adjustment ───────────────────────────────────────────
// Direct bonus, raise, or manual deduction with immediate impact, log, and notification
router.post("/employees/:id/adjustment", requireAuth, async (req, res): Promise<void> => {
  const empId = parseInt(String(req.params.id));
  if (!empId || isNaN(empId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({
    type: z.enum(["deduction", "bonus", "raise"]),
    amount: z.number().positive(),
    reason: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

  const { type, amount, reason } = parsed.data;
  const baseSal = emp.baseSalary;
  let newBalance = baseSal;
  let txAmount = amount;

  if (type === "deduction") {
    txAmount = -amount;
    newBalance = baseSal - amount;
  } else if (type === "bonus") {
    txAmount = amount;
    newBalance = baseSal + amount;
  } else if (type === "raise") {
    txAmount = amount;
    newBalance = baseSal + amount;
    await db.update(employeesTable).set({ baseSalary: newBalance }).where(eq(employeesTable.id, empId));
  }

  // Record transaction
  const [tx] = await db.insert(transactionsTable).values({
    employeeId: empId,
    type,
    amount: txAmount,
    reason,
    adminName: "الأدمن",
    balanceBefore: baseSal,
    balanceAfter: newBalance,
  }).returning();

  // Send direct notification to employee
  const notificationMsg = type === "deduction"
    ? `تم خصم مبلغ ${amount} دج من حسابك. السبب: ${reason}`
    : type === "bonus"
    ? `تم إضافة مكافأة بقيمة ${amount} دج لحسابك. السبب: ${reason}`
    : `تم زيادة راتبك الأساسي بمقدار ${amount} دج ليصل إلى ${newBalance} دج. السبب: ${reason}`;

  await db.insert(notificationsTable).values({
    type: "general",
    message: notificationMsg,
    recipientType: "employee",
    recipientEmployeeId: empId,
    referenceId: tx.id,
    referenceType: "adjustment",
  });

  res.status(201).json(tx);
});

// ── GET /employees/:id/salary-balance ──────────────────────────────────────
// Returns live running balance for this employee in the current (or given) month
router.get("/employees/:id/salary-balance", requireAuth, async (req, res): Promise<void> => {
  const empId = parseInt(String(req.params.id));
  if (!empId || isNaN(empId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const today = new Date();
  const month = typeof req.query.month === 'string' ? req.query.month : (today.getMonth() + 1).toString().padStart(2, '0');
  const year = typeof req.query.year === 'string' ? parseInt(req.query.year) : today.getFullYear();
  const monthStr = `${year}-${month}`;

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));
  if (!emp) { res.status(404).json({ error: "Not found" }); return; }

  const allAttendance = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, empId));
  const monthRecords = allAttendance.filter(r => r.date.startsWith(monthStr));
  const lateDeductions = monthRecords.reduce((s, r) => s + ((r as any).lateDeduction ?? 0), 0);

  const advances = await db.select().from(advancesTable)
    .where(and(eq(advancesTable.employeeId, empId), eq(advancesTable.status, "approved"), isNull(advancesTable.salaryId)));
  const advanceDeductions = advances.reduce((s, a) => s + a.amount, 0);

  const violations = await db.select().from(violationsTable)
    .where(and(eq(violationsTable.employeeId, empId), isNotNull(violationsTable.amount)));
  const violationDeductions = violations.reduce((s, v) => s + ((v as any).amount ?? 0), 0);

  const txs = await db.select().from(transactionsTable).where(eq(transactionsTable.employeeId, empId));
  const netTxAdjustments = txs.reduce((sum, t) => sum + t.amount, 0);

  const totalDeductions = lateDeductions + advanceDeductions + violationDeductions;
  const currentBalance = Math.max(0, emp.baseSalary - totalDeductions + netTxAdjustments);

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
    violations: violations.map(v => ({ id: v.id, reason: v.reason, amount: (v as any).amount })),
  });
});

export default router;
