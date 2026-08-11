import { Router, type IRouter } from "express";
import { db, violationsTable, employeesTable, officesTable, notificationsTable, transactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function enrichViolation(v: typeof violationsTable.$inferSelect) {
  const [emp] = await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName, officeId: employeesTable.officeId })
    .from(employeesTable).where(eq(employeesTable.id, v.employeeId));
  const [office] = emp ? await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId)) : [];
  return {
    ...v,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null,
    officeName: office?.name ?? null,
  };
}

const ListViolationsQuery = z.object({
  employeeId: z.string().optional(),
  status: z.string().optional(),
});

router.get("/violations", requireAuth, async (req, res): Promise<void> => {
  const query = ListViolationsQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "invalid_query" }); return; }

  let rows = await db.select().from(violationsTable).orderBy(desc(violationsTable.createdAt));
  if (query.data.employeeId) rows = rows.filter(v => v.employeeId === Number(query.data.employeeId));

  const enriched = await Promise.all(rows.map(enrichViolation));
  res.json(enriched);
});

const VIOLATION_TYPES = ["tardiness", "absence", "early_departure", "manual", "other"] as const;

const CreateViolationBody = z.object({
  employeeId: z.number().int().positive(),
  violationType: z.enum(VIOLATION_TYPES).default("manual"),
  violationDate: z.string().optional().nullable(), // YYYY-MM-DD
  violationTime: z.string().optional().nullable(), // HH:MM
  reason: z.string().min(1),
  amount: z.number().positive(),
  notes: z.string().optional(),
});

router.post("/violations", requireAuth, async (req, res): Promise<void> => {
  const body = CreateViolationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const amount = body.data.amount;

  const [violation] = await db.insert(violationsTable).values({
    employeeId: body.data.employeeId,
    violationType: body.data.violationType,
    violationDate: body.data.violationDate ?? new Date().toISOString().split("T")[0],
    violationTime: body.data.violationTime ?? null,
    reason: body.data.reason,
    amount,
    notes: body.data.notes ?? null,
    status: "deducted",
  }).returning();

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, body.data.employeeId));
  const empName = emp ? `${emp.firstName} ${emp.lastName}` : "الموظف";
  const baseSal = emp?.baseSalary ?? 0;

  // Log transaction
  await db.insert(transactionsTable).values({
    employeeId: body.data.employeeId,
    type: "violation",
    amount: -amount,
    reason: `مخالفة: ${body.data.reason}`,
    adminName: "الأدمن",
    balanceBefore: baseSal,
    balanceAfter: baseSal - amount,
  });

  // Notify employee directly
  await db.insert(notificationsTable).values({
    type: "violation_added",
    message: `تم خصم مبلغ ${amount} دج من حسابك بسبب مخالفة: ${body.data.reason}`,
    recipientType: "employee",
    recipientEmployeeId: body.data.employeeId,
    referenceId: violation.id,
    referenceType: "violation",
  });

  // Notify admin
  await db.insert(notificationsTable).values({
    type: "violation_added",
    message: `تم تسجيل وخصم مخالفة على ${empName}: ${body.data.reason} بقيمة ${amount} دج`,
    recipientType: "admin",
    referenceId: violation.id,
    referenceType: "violation",
  });

  res.status(201).json(await enrichViolation(violation));
});

const UpdateViolationBody = z.object({
  violationType: z.enum(VIOLATION_TYPES).optional(),
  violationDate: z.string().nullable().optional(),
  violationTime: z.string().nullable().optional(),
  reason: z.string().min(1).optional(),
  amount: z.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.patch("/violations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "invalid_id" }); return; }

  const [existing] = await db.select().from(violationsTable).where(eq(violationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "not_found" }); return; }
  if (existing.status === "deducted") { res.status(409).json({ error: "cannot_modify_deducted" }); return; }

  const body = UpdateViolationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const updates: Partial<typeof violationsTable.$inferInsert> = { updatedAt: new Date() };
  if (body.data.violationType !== undefined) updates.violationType = body.data.violationType;
  if (body.data.violationDate !== undefined) updates.violationDate = body.data.violationDate;
  if (body.data.violationTime !== undefined) updates.violationTime = body.data.violationTime;
  if (body.data.reason !== undefined) updates.reason = body.data.reason;
  if (body.data.amount !== undefined) updates.amount = body.data.amount;
  if (body.data.notes !== undefined) updates.notes = body.data.notes;

  const [updated] = await db.update(violationsTable).set(updates).where(eq(violationsTable.id, id)).returning();
  res.json(await enrichViolation(updated));
});

router.delete("/violations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "invalid_id" }); return; }

  const [existing] = await db.select().from(violationsTable).where(eq(violationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "not_found" }); return; }
  if (existing.status === "deducted") { res.status(409).json({ error: "cannot_delete_deducted" }); return; }

  await db.delete(violationsTable).where(eq(violationsTable.id, id));
  res.json({ success: true });
});

export default router;
