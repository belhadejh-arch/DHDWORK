import { Router, type IRouter } from "express";
import { db, bonusesTable, employeesTable, notificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// GET /bonuses?employeeId=X&status=pending
router.get("/bonuses", requireAuth, async (req, res): Promise<void> => {
  const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : null;
  const status = req.query.status as string | undefined;

  let bonuses = await db.select().from(bonusesTable).orderBy(desc(bonusesTable.date));
  if (employeeId) bonuses = bonuses.filter(b => b.employeeId === employeeId);
  if (status) bonuses = bonuses.filter(b => b.status === status);

  // Enrich with employee names
  const enriched = await Promise.all(bonuses.map(async (b) => {
    const [emp] = await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName })
      .from(employeesTable).where(eq(employeesTable.id, b.employeeId));
    return { ...b, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null };
  }));

  res.json(enriched);
});

// POST /bonuses — admin adds a bonus for an employee
router.post("/bonuses", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, amount, reason, notes, date } = req.body;

  if (!employeeId || !amount || !reason) {
    res.status(400).json({ error: "employeeId, amount, reason required" });
    return;
  }
  if (amount <= 0) {
    res.status(400).json({ error: "amount must be positive" });
    return;
  }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

  const bonusDate = date || new Date().toISOString().split("T")[0];

  const [bonus] = await db.insert(bonusesTable).values({
    employeeId,
    amount,
    reason,
    notes: notes || null,
    date: bonusDate,
    status: "pending",
  }).returning();

  // Notify employee
  await db.insert(notificationsTable).values({
    type: "bonus_added",
    message: `🎁 تم منحك مكافأة بمبلغ ${amount.toLocaleString()} دج — السبب: ${reason}${notes ? ` — ملاحظة: ${notes}` : ""} — التاريخ: ${bonusDate}`,
    recipientType: "employee",
    recipientEmployeeId: employeeId,
    referenceId: bonus.id,
    referenceType: "bonus",
  });

  res.status(201).json({ ...bonus, employeeName: `${emp.firstName} ${emp.lastName}` });
});

// DELETE /bonuses/:id — cancel a pending bonus
router.delete("/bonuses/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [bonus] = await db.select().from(bonusesTable).where(eq(bonusesTable.id, id));
  if (!bonus) { res.status(404).json({ error: "Bonus not found" }); return; }
  if (bonus.status === "applied") {
    res.status(400).json({ error: "Cannot delete an applied bonus" });
    return;
  }

  await db.delete(bonusesTable).where(eq(bonusesTable.id, id));
  res.status(204).end();
});

export default router;
