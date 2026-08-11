import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  UpdateSettingsBody,
  GetSettingsResponse,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/settings", requireAuth, async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings) {
    const [created] = await db.insert(settingsTable).values({}).returning();
    res.json(created);
    return;
  }
  res.json(settings);
});

router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const [existing] = await db.select().from(settingsTable).limit(1);
  let settings;
  if (existing) {
    [settings] = await db.update(settingsTable)
      .set(req.body)
      .where(eq(settingsTable.id, existing.id))
      .returning();
  } else {
    [settings] = await db.insert(settingsTable).values(req.body).returning();
  }
  res.json(settings);
});

export default router;
