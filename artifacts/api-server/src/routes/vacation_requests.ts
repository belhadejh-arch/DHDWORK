import { Router, type IRouter } from "express";
import { db, vacationRequestsTable, employeesTable, officesTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListVacationRequestsQueryParams,
  CreateVacationRequestBody,
  ApproveVacationRequestParams,
  ApproveVacationRequestBody,
  RejectVacationRequestParams,
  RejectVacationRequestBody,
  ListVacationRequestsResponse,
  CreateVacationRequestResponse,
  ApproveVacationRequestResponse,
  RejectVacationRequestResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function enrich(r: typeof vacationRequestsTable.$inferSelect) {
  const [emp] = await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName, officeId: employeesTable.officeId })
    .from(employeesTable).where(eq(employeesTable.id, r.employeeId));
  const [office] = emp ? await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId)) : [];
  return { ...r, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null, officeName: office?.name ?? null };
}

router.get("/vacation-requests", requireAuth, async (req, res): Promise<void> => {
  const query = ListVacationRequestsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  let rows = await db.select().from(vacationRequestsTable).orderBy(vacationRequestsTable.requestedAt);
  if (query.data.employeeId) rows = rows.filter(r => r.employeeId === Number(query.data.employeeId));
  if (query.data.status) rows = rows.filter(r => r.status === query.data.status);
  res.json(ListVacationRequestsResponse.parse(await Promise.all(rows.map(enrich))));
});

router.post("/vacation-requests", requireAuth, async (req, res): Promise<void> => {
  const body = CreateVacationRequestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.insert(vacationRequestsTable).values({ ...body.data, status: "pending" }).returning();
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, body.data.employeeId));
  await db.insert(notificationsTable).values({
    type: "vacation_request",
    message: `${emp ? emp.firstName + " " + emp.lastName : "موظف"} قدّم طلب عطلة من ${body.data.startDate} إلى ${body.data.endDate}`,
    recipientType: "admin",
    referenceId: row.id,
    referenceType: "vacation",
  });
  res.status(201).json(CreateVacationRequestResponse.parse(await enrich(row)));
});

router.patch("/vacation-requests/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const params = ApproveVacationRequestParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const noteBody = ApproveVacationRequestBody.safeParse(req.body);
  const adminNote = noteBody.success ? (noteBody.data.adminNote ?? null) : null;
  const [row] = await db.update(vacationRequestsTable).set({ status: "approved", resolvedAt: new Date(), adminNote }).where(eq(vacationRequestsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Vacation request not found" }); return; }
  // Notify employee
  const noteText = adminNote ? ` — ملاحظة الأدمن: ${adminNote}` : "";
  await db.insert(notificationsTable).values({
    type: "vacation_approved",
    message: `تمت الموافقة على طلب العطلة الخاص بك${noteText}`,
    recipientType: "employee",
    recipientEmployeeId: row.employeeId,
    referenceId: row.id,
    referenceType: "vacation",
  });
  res.json(ApproveVacationRequestResponse.parse(await enrich(row)));
});

router.patch("/vacation-requests/:id/reject", requireAuth, async (req, res): Promise<void> => {
  const params = RejectVacationRequestParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = RejectVacationRequestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(vacationRequestsTable)
    .set({ status: "rejected", rejectionReason: body.data.reason ?? null, resolvedAt: new Date() })
    .where(eq(vacationRequestsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Vacation request not found" }); return; }
  // Notify employee
  const reasonText = body.data.reason ? ` — السبب: ${body.data.reason}` : "";
  await db.insert(notificationsTable).values({
    type: "vacation_rejected",
    message: `تم رفض طلب العطلة الخاص بك${reasonText}`,
    recipientType: "employee",
    recipientEmployeeId: row.employeeId,
    referenceId: row.id,
    referenceType: "vacation",
  });
  res.json(RejectVacationRequestResponse.parse(await enrich(row)));
});

export default router;
