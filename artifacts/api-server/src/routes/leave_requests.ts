import { Router, type IRouter } from "express";
import { db, leaveRequestsTable, employeesTable, officesTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListLeaveRequestsQueryParams,
  CreateLeaveRequestBody,
  ApproveLeaveRequestParams,
  ApproveLeaveRequestBody,
  RejectLeaveRequestParams,
  RejectLeaveRequestBody,
  ListLeaveRequestsResponse,
  CreateLeaveRequestResponse,
  ApproveLeaveRequestResponse,
  RejectLeaveRequestResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function enrich(r: typeof leaveRequestsTable.$inferSelect) {
  const [emp] = await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName, officeId: employeesTable.officeId })
    .from(employeesTable).where(eq(employeesTable.id, r.employeeId));
  const [office] = emp ? await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId)) : [];
  return { ...r, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null, officeName: office?.name ?? null };
}

router.get("/leave-requests", requireAuth, async (req, res): Promise<void> => {
  const query = ListLeaveRequestsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  let rows = await db.select().from(leaveRequestsTable).orderBy(leaveRequestsTable.requestedAt);
  if (query.data.employeeId) rows = rows.filter(r => r.employeeId === Number(query.data.employeeId));
  if (query.data.status) rows = rows.filter(r => r.status === query.data.status);
  res.json(ListLeaveRequestsResponse.parse(await Promise.all(rows.map(enrich))));
});

router.post("/leave-requests", requireAuth, async (req, res): Promise<void> => {
  const body = CreateLeaveRequestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.insert(leaveRequestsTable).values({ ...body.data, status: "pending" }).returning();
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, body.data.employeeId));
  await db.insert(notificationsTable).values({
    type: "leave_request",
    message: `${emp ? emp.firstName + " " + emp.lastName : "موظف"} قدّم طلب إجازة (${body.data.leaveType}) من ${body.data.startDate} إلى ${body.data.endDate}`,
    recipientType: "admin",
    referenceId: row.id,
    referenceType: "leave",
  });
  res.status(201).json(CreateLeaveRequestResponse.parse(await enrich(row)));
});

router.patch("/leave-requests/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const params = ApproveLeaveRequestParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const noteBody = ApproveLeaveRequestBody.safeParse(req.body);
  const adminNote = noteBody.success ? (noteBody.data.adminNote ?? null) : null;
  const [row] = await db.update(leaveRequestsTable).set({ status: "approved", resolvedAt: new Date(), adminNote }).where(eq(leaveRequestsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Leave request not found" }); return; }
  // Notify employee
  const noteText = adminNote ? ` — ملاحظة الأدمن: ${adminNote}` : "";
  await db.insert(notificationsTable).values({
    type: "leave_approved",
    message: `تمت الموافقة على طلب الإجازة الخاص بك${noteText}`,
    recipientType: "employee",
    recipientEmployeeId: row.employeeId,
    referenceId: row.id,
    referenceType: "leave",
  });
  res.json(ApproveLeaveRequestResponse.parse(await enrich(row)));
});

router.patch("/leave-requests/:id/reject", requireAuth, async (req, res): Promise<void> => {
  const params = RejectLeaveRequestParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = RejectLeaveRequestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(leaveRequestsTable)
    .set({ status: "rejected", rejectionReason: body.data.reason ?? null, resolvedAt: new Date() })
    .where(eq(leaveRequestsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Leave request not found" }); return; }
  // Notify employee
  const reasonText = body.data.reason ? ` — السبب: ${body.data.reason}` : "";
  await db.insert(notificationsTable).values({
    type: "leave_rejected",
    message: `تم رفض طلب الإجازة الخاص بك${reasonText}`,
    recipientType: "employee",
    recipientEmployeeId: row.employeeId,
    referenceId: row.id,
    referenceType: "leave",
  });
  res.json(RejectLeaveRequestResponse.parse(await enrich(row)));
});

export default router;
