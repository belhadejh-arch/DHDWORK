import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  ListNotificationsQueryParams,
  MarkNotificationReadParams,
  ListNotificationsResponse,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const recipientType = (req.query.recipientType as string) || "admin";
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
  const unreadOnly = req.query.unreadOnly === "true";

  let conditions = [eq(notificationsTable.recipientType, recipientType as "admin" | "employee")];
  if (recipientType === "employee" && employeeId) {
    conditions.push(eq(notificationsTable.recipientEmployeeId, employeeId));
  }

  let notifications = await db.select().from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(100);

  if (unreadOnly) notifications = notifications.filter(n => !n.isRead);
  res.json(notifications);
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "invalid_id" }); return; }

  const [notif] = await db.update(notificationsTable).set({ isRead: true })
    .where(eq(notificationsTable.id, id))
    .returning();
  if (!notif) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json(notif);
});

router.patch("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const recipientType = (req.query.recipientType as string) || "admin";
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;

  let conditions = [eq(notificationsTable.recipientType, recipientType as "admin" | "employee")];
  if (recipientType === "employee" && employeeId) {
    conditions.push(eq(notificationsTable.recipientEmployeeId, employeeId));
  }

  await db.update(notificationsTable).set({ isRead: true }).where(and(...conditions));
  res.json({ success: true });
});

export default router;
