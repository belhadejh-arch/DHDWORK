import { Router, type IRouter } from "express";
import { db, adminsTable } from "@workspace/db";
import { eq, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  hashPassword,
  generateUniqueSerialNumber,
  generateUniqueQrCodeData,
} from "../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

// Helper: get current admin's isPrimary flag
async function isPrimaryAdmin(adminId: number): Promise<boolean> {
  const [admin] = await db
    .select({ isPrimary: adminsTable.isPrimary })
    .from(adminsTable)
    .where(eq(adminsTable.id, adminId));
  return admin?.isPrimary === true;
}

function publicAdmin(admin: typeof adminsTable.$inferSelect) {
  const { passwordHash: _ph, qrCodeData: _qr, ...rest } = admin;
  return rest;
}

const AdminWriteSchema = z.object({
  firstName: z.string().min(1, "الاسم مطلوب"),
  lastName: z.string().min(1, "اللقب مطلوب"),
  email: z.string().email("بريد إلكتروني غير صالح"),
  phone: z.string().optional().nullable(),
});

// ─── List all admins ───────────────────────────────────────────────────────────
router.get("/admins", requireAuth, async (req, res): Promise<void> => {
  const admins = await db
    .select({
      id: adminsTable.id,
      username: adminsTable.username,
      email: adminsTable.email,
      firstName: adminsTable.firstName,
      lastName: adminsTable.lastName,
      phone: adminsTable.phone,
      serialNumber: adminsTable.serialNumber,
      isPrimary: adminsTable.isPrimary,
      createdAt: adminsTable.createdAt,
    })
    .from(adminsTable)
    .orderBy(adminsTable.id);
  res.json(admins);
});

// ─── Create admin (primary only) ──────────────────────────────────────────────
router.post("/admins", requireAuth, async (req, res): Promise<void> => {
  if (!(await isPrimaryAdmin(req.adminId!))) {
    res.status(403).json({ error: "Only the primary admin can create admins" });
    return;
  }

  const parsed = AdminWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { firstName, lastName, email, phone } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const [dup] = await db
    .select({ id: adminsTable.id })
    .from(adminsTable)
    .where(eq(adminsTable.email, normalizedEmail));
  if (dup) {
    res.status(409).json({ error: "email_exists" });
    return;
  }

  const serialNumber = await generateUniqueSerialNumber("ADM");
  const qrCodeData = await generateUniqueQrCodeData();
  // Username derived from email local part
  const baseUsername = normalizedEmail.split("@")[0].replace(/[^a-z0-9_]/gi, "");
  const username = `${baseUsername}_${Date.now()}`;

  const [admin] = await db
    .insert(adminsTable)
    .values({
      username,
      email: normalizedEmail,
      passwordHash: hashPassword("DHD@Admin2024"), // default password; admin can change later
      firstName,
      lastName,
      phone: phone ?? null,
      serialNumber,
      qrCodeData,
      isPrimary: false,
    })
    .returning();

  res.status(201).json(publicAdmin(admin));
});

// ─── Update admin (primary only) ──────────────────────────────────────────────
router.patch("/admins/:id", requireAuth, async (req, res): Promise<void> => {
  if (!(await isPrimaryAdmin(req.adminId!))) {
    res.status(403).json({ error: "Only the primary admin can update admins" });
    return;
  }

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = AdminWriteSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.firstName !== undefined) update.firstName = parsed.data.firstName;
  if (parsed.data.lastName !== undefined) update.lastName = parsed.data.lastName;
  if (parsed.data.phone !== undefined) update.phone = parsed.data.phone ?? null;
  if (parsed.data.email !== undefined) {
    const normalizedEmail = parsed.data.email.toLowerCase().trim();
    const [dup] = await db
      .select({ id: adminsTable.id })
      .from(adminsTable)
      .where(eq(adminsTable.email, normalizedEmail));
    if (dup && dup.id !== id) {
      res.status(409).json({ error: "email_exists" });
      return;
    }
    update.email = normalizedEmail;
  }

  const [admin] = await db
    .update(adminsTable)
    .set(update)
    .where(eq(adminsTable.id, id))
    .returning();

  if (!admin) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }
  res.json(publicAdmin(admin));
});

// ─── Delete admin (primary only, can't delete self/primary) ───────────────────
router.delete("/admins/:id", requireAuth, async (req, res): Promise<void> => {
  if (!(await isPrimaryAdmin(req.adminId!))) {
    res.status(403).json({ error: "Only the primary admin can delete admins" });
    return;
  }

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [target] = await db
    .select({ isPrimary: adminsTable.isPrimary })
    .from(adminsTable)
    .where(eq(adminsTable.id, id));

  if (!target) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }
  if (target.isPrimary) {
    res.status(400).json({ error: "Cannot delete the primary admin" });
    return;
  }

  await db.delete(adminsTable).where(eq(adminsTable.id, id));
  res.sendStatus(204);
});

// ─── Get admin QR code (primary only) ─────────────────────────────────────────
router.get("/admins/:id/qrcode", requireAuth, async (req, res): Promise<void> => {
  if (!(await isPrimaryAdmin(req.adminId!))) {
    res.status(403).json({ error: "Only the primary admin can view admin QR codes" });
    return;
  }

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [admin] = await db
    .select({
      id: adminsTable.id,
      serialNumber: adminsTable.serialNumber,
      qrCodeData: adminsTable.qrCodeData,
      firstName: adminsTable.firstName,
      lastName: adminsTable.lastName,
    })
    .from(adminsTable)
    .where(eq(adminsTable.id, id));

  if (!admin) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }
  res.json(admin);
});

// ─── Reset another admin's password (primary only) ────────────────────────────
router.patch("/admins/:id/password", requireAuth, async (req, res): Promise<void> => {
  if (!(await isPrimaryAdmin(req.adminId!))) {
    res.status(403).json({ error: "Only the primary admin can reset admin passwords" });
    return;
  }

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = z.object({ newPassword: z.string().min(6, "يجب أن تكون 6 أحرف على الأقل") })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "كلمة مرور غير صالحة" });
    return;
  }

  const [admin] = await db.select({ id: adminsTable.id })
    .from(adminsTable)
    .where(eq(adminsTable.id, id));
  if (!admin) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }

  await db.update(adminsTable)
    .set({ passwordHash: hashPassword(parsed.data.newPassword) })
    .where(eq(adminsTable.id, id));

  console.log(`[AUTH] Primary admin ${req.adminId} reset password for admin ${id}`);
  res.json({ success: true });
});

// ─── Regenerate admin QR code (primary only) ──────────────────────────────────
router.post("/admins/:id/qrcode/regenerate", requireAuth, async (req, res): Promise<void> => {
  if (!(await isPrimaryAdmin(req.adminId!))) {
    res.status(403).json({ error: "Only the primary admin can regenerate admin QR codes" });
    return;
  }

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const newQr = await generateUniqueQrCodeData();
  const [admin] = await db
    .update(adminsTable)
    .set({ qrCodeData: newQr })
    .where(eq(adminsTable.id, id))
    .returning({
      id: adminsTable.id,
      serialNumber: adminsTable.serialNumber,
      qrCodeData: adminsTable.qrCodeData,
      firstName: adminsTable.firstName,
      lastName: adminsTable.lastName,
    });

  if (!admin) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }
  res.json(admin);
});

export default router;
