import { Router, type IRouter } from "express";
import { db, advancesTable, employeesTable, officesTable, notificationsTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

import {
  ListAdvancesQueryParams,
  CreateAdvanceBody,
  ApproveAdvanceParams,
  ApproveAdvanceBody,
  RejectAdvanceParams,
  RejectAdvanceBody,
  ListAdvancesResponse,
  CreateAdvanceResponse,
  ApproveAdvanceResponse,
  RejectAdvanceResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function enrichAdvance(a: typeof advancesTable.$inferSelect) {
  const [emp] = await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName, officeId: employeesTable.officeId })
    .from(employeesTable).where(eq(employeesTable.id, a.employeeId));
  const [office] = emp ? await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId)) : [];
  return {
    ...a,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null,
    officeName: office?.name ?? null,
  };
}

router.get("/advances", requireAuth, async (req, res): Promise<void> => {
  const query = ListAdvancesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let advances = await db.select().from(advancesTable).orderBy(advancesTable.requestedAt);
  if (query.data.employeeId) advances = advances.filter(a => a.employeeId === Number(query.data.employeeId));
  if (query.data.status) advances = advances.filter(a => a.status === query.data.status);
  const enriched = await Promise.all(advances.map(enrichAdvance));
  res.json(ListAdvancesResponse.parse(enriched));
});

router.post("/advances", requireAuth, async (req, res): Promise<void> => {
  const body = CreateAdvanceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [advance] = await db.insert(advancesTable).values({ ...body.data, status: "pending" }).returning();
  // Create notification
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, body.data.employeeId));
  await db.insert(notificationsTable).values({
    type: "advance_request",
    message: `${emp ? emp.firstName + " " + emp.lastName : "موظف"} طلب سلفة بقيمة ${body.data.amount.toLocaleString()} دج`,
    recipientType: "admin",
    referenceId: advance.id,
    referenceType: "advance",
  });
  res.status(201).json(CreateAdvanceResponse.parse(await enrichAdvance(advance)));
});

router.patch("/advances/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const params = ApproveAdvanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const noteBody = ApproveAdvanceBody.safeParse(req.body);
  const adminNote = noteBody.success ? (noteBody.data.adminNote ?? null) : null;
  const [advance] = await db.update(advancesTable)
    .set({ status: "approved", resolvedAt: new Date(), adminNote })
    .where(eq(advancesTable.id, params.data.id))
    .returning();
  if (!advance) {
    res.status(404).json({ error: "Advance not found" });
    return;
  }
  // Log transaction
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, advance.employeeId));
  const baseSal = emp?.baseSalary ?? 0;
  await db.insert(transactionsTable).values({
    employeeId: advance.employeeId,
    type: "advance",
    amount: -advance.amount,
    reason: `سلفة مقبولة: ${advance.reason || "طلب سلفة"}`,
    adminName: "الأدمن",
    balanceBefore: baseSal,
    balanceAfter: baseSal - advance.amount,
  });

  // Notify employee
  const noteText = adminNote ? ` — ملاحظة الأدمن: ${adminNote}` : "";
  await db.insert(notificationsTable).values({
    type: "advance_approved",
    message: `تمت الموافقة على طلب السلفة الخاص بك بمبلغ ${advance.amount} دج${noteText}`,
    recipientType: "employee",
    recipientEmployeeId: advance.employeeId,
    referenceId: advance.id,
    referenceType: "advance",
  });
  res.json(ApproveAdvanceResponse.parse(await enrichAdvance(advance)));
});

router.patch("/advances/:id/reject", requireAuth, async (req, res): Promise<void> => {
  const params = RejectAdvanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = RejectAdvanceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [advance] = await db.update(advancesTable)
    .set({ status: "rejected", rejectionReason: body.data.reason ?? null, resolvedAt: new Date() })
    .where(eq(advancesTable.id, params.data.id))
    .returning();
  if (!advance) {
    res.status(404).json({ error: "Advance not found" });
    return;
  }
  // Notify employee
  const reasonText = body.data.reason ? ` — السبب: ${body.data.reason}` : "";
  await db.insert(notificationsTable).values({
    type: "advance_rejected",
    message: `تم رفض طلب السلفة الخاص بك${reasonText}`,
    recipientType: "employee",
    recipientEmployeeId: advance.employeeId,
    referenceId: advance.id,
    referenceType: "advance",
  });
  res.json(RejectAdvanceResponse.parse(await enrichAdvance(advance)));
});

export default router;
