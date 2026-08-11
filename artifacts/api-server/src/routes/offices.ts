import { Router, type IRouter } from "express";
import { db, officesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetOfficeParams,
  GetOfficeQrCodeParams,
  ListOfficesResponse,
  GetOfficeResponse,
  GetOfficeQrCodeResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { randomBytes } from "crypto";

const router: IRouter = Router();

export function generateOfficeQrData(): string {
  return `DHD-OFFICE-${randomBytes(16).toString("hex")}`;
}

/**
 * Validate a QR token against the offices table.
 * Returns the officeId if found, null otherwise.
 */
export async function validateQrToken(token: string): Promise<number | null> {
  if (!token) return null;
  const [office] = await db.select().from(officesTable).where(eq(officesTable.qrCodeData, token));
  return office ? office.id : null;
}

router.get("/offices", requireAuth, async (_req, res): Promise<void> => {
  const offices = await db.select().from(officesTable).orderBy(officesTable.id);
  res.json(ListOfficesResponse.parse(offices));
});

router.get("/offices/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetOfficeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, params.data.id));
  if (!office) {
    res.status(404).json({ error: "Office not found" });
    return;
  }
  res.json(GetOfficeResponse.parse(office));
});

router.get("/offices/:id/qrcode", requireAuth, async (req, res): Promise<void> => {
  const params = GetOfficeQrCodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, params.data.id));
  if (!office) {
    res.status(404).json({ error: "Office not found" });
    return;
  }

  // Ensure the office has a QR code; generate if missing
  let qrCodeData = office.qrCodeData;
  if (!qrCodeData) {
    qrCodeData = generateOfficeQrData();
    await db.update(officesTable).set({ qrCodeData }).where(eq(officesTable.id, office.id));
  }

  // Return in a format compatible with the existing frontend (uses .token)
  res.json(GetOfficeQrCodeResponse.parse({ officeId: office.id, token: qrCodeData, expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) }));
});

// Admin can regenerate the QR code for an office
router.post("/offices/:id/qrcode/regenerate", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, id));
  if (!office) { res.status(404).json({ error: "Office not found" }); return; }
  const qrCodeData = generateOfficeQrData();
  await db.update(officesTable).set({ qrCodeData }).where(eq(officesTable.id, id));
  res.json({ officeId: id, token: qrCodeData });
});

export default router;
