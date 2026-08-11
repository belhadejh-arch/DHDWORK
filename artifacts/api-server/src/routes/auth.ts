import { Router, type IRouter } from "express";
import { db, adminsTable, employeesTable, officesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  LoginBody,
  ChangePasswordBody,
} from "@workspace/api-zod";
import { hashPassword, verifyPassword, createSession, deleteSession, deleteSessionsForUser, getTokenFromRequest, getSession, generateUniqueQrCodeData } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

// ─── Email + Password Login (Admin only) ──────────────────────────────────────
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.email, normalizedEmail));
  if (!admin) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (!verifyPassword(password, admin.passwordHash)) {
    console.log(`[AUTH] Admin login failed for email=${normalizedEmail}: wrong password`);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = await createSession("admin", admin.id);
  console.log(`[AUTH] Admin login success: id=${admin.id} email=${normalizedEmail}`);
  res.json({
    userType: "admin",
    admin: { id: admin.id, username: admin.username, email: admin.email, firstName: admin.firstName, lastName: admin.lastName, phone: admin.phone, isPrimary: admin.isPrimary, createdAt: admin.createdAt },
    token,
  });
});

// ─── Serial Number Login (Admin + Employee) ───────────────────────────────────
const SerialLoginBody = z.object({ serialNumber: z.string().min(1) });

router.post("/auth/login/serial", async (req, res): Promise<void> => {
  const parsed = SerialLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Serial number required" });
    return;
  }
  const { serialNumber } = parsed.data;
  const sn = serialNumber.trim().toUpperCase();

  // Check admin first
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.serialNumber, sn));
  if (admin) {
    const token = await createSession("admin", admin.id);
    console.log(`[AUTH] Admin serial login: id=${admin.id} serial=${sn}`);
    res.json({
      userType: "admin",
      admin: { id: admin.id, username: admin.username, email: admin.email, firstName: admin.firstName, lastName: admin.lastName, phone: admin.phone, isPrimary: admin.isPrimary, createdAt: admin.createdAt },
      token,
    });
    return;
  }

  // Check employee
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.serialNumber, sn));
  if (!emp) {
    res.status(401).json({ error: "Invalid serial number" });
    return;
  }
  if (!emp.isActive) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }
  await deleteSessionsForUser("employee", emp.id);
  const token = await createSession("employee", emp.id);
  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId));
  const { passwordHash: _ph, qrCodeData: _qr, ...empPub } = emp;
  console.log(`[AUTH] Employee serial login: id=${emp.id} serial=${sn}`);
  res.json({
    userType: "employee",
    employee: { ...empPub, officeName: office?.name ?? null },
    token,
  });
});

// ─── QR Code Login (Admin + Employee) ─────────────────────────────────────────
const QrLoginBody = z.object({ qrCodeData: z.string().min(1) });

router.post("/auth/login/qr", async (req, res): Promise<void> => {
  const parsed = QrLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "QR code data required" });
    return;
  }
  const { qrCodeData } = parsed.data;

  // Check admin first
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.qrCodeData, qrCodeData));
  if (admin) {
    const token = await createSession("admin", admin.id);
    console.log(`[AUTH] Admin QR login: id=${admin.id}`);
    res.json({
      userType: "admin",
      admin: { id: admin.id, username: admin.username, email: admin.email, firstName: admin.firstName, lastName: admin.lastName, phone: admin.phone, isPrimary: admin.isPrimary, createdAt: admin.createdAt },
      token,
    });
    return;
  }

  // Check employee
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.qrCodeData, qrCodeData));
  if (!emp) {
    res.status(401).json({ error: "Invalid QR code" });
    return;
  }
  if (!emp.isActive) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }
  await deleteSessionsForUser("employee", emp.id);
  const token = await createSession("employee", emp.id);
  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId));
  const { passwordHash: _ph, qrCodeData: _qr, ...empPub } = emp;
  console.log(`[AUTH] Employee QR login: id=${emp.id}`);
  res.json({
    userType: "employee",
    employee: { ...empPub, officeName: office?.name ?? null },
    token,
  });
});

// ─── Logout ────────────────────────────────────────────────────────────────────
router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = getTokenFromRequest(req);
  if (token) await deleteSession(token);
  res.json({ success: true });
});

// ─── /me ───────────────────────────────────────────────────────────────────────
router.get("/auth/me", async (req, res): Promise<void> => {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const session = await getSession(token);
  if (!session) {
    res.status(401).json({ error: "Session expired" });
    return;
  }

  if (session.userType === "admin") {
    const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, session.userId));
    if (!admin) {
      res.status(401).json({ error: "Admin not found" });
      return;
    }
    console.log(`[AUTH] /me admin id=${admin.id}`);
    res.json({
      userType: "admin",
      id: admin.id,
      username: admin.username,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      phone: admin.phone,
      serialNumber: admin.serialNumber,
      qrCodeData: admin.qrCodeData,
      isPrimary: admin.isPrimary,
      createdAt: admin.createdAt,
    });
    return;
  }

  if (session.userType === "employee") {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, session.userId));
    if (!emp || !emp.isActive) {
      res.status(401).json({ error: "Employee not found or suspended" });
      return;
    }
    const [office] = await db.select().from(officesTable).where(eq(officesTable.id, emp.officeId));
    console.log(`[AUTH] /me employee id=${emp.id}`);
    const { passwordHash: _ph, qrCodeData: _qr, ...empPub } = emp;
    res.json({ userType: "employee", ...empPub, officeName: office?.name ?? null });
    return;
  }

  res.status(401).json({ error: "Invalid session" });
});

// ─── Admin: Regenerate own QR code ─────────────────────────────────────────────
router.post("/auth/regenerate-qr", requireAuth, async (req, res): Promise<void> => {
  const newQr = await generateUniqueQrCodeData();
  await db.update(adminsTable).set({ qrCodeData: newQr }).where(eq(adminsTable.id, req.adminId!));
  res.json({ qrCodeData: newQr });
});

// ─── Change Password ────────────────────────────────────────────────────────────
router.patch("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, req.adminId!));
  if (!admin || !verifyPassword(parsed.data.currentPassword, admin.passwordHash)) {
    res.status(400).json({ error: "Invalid current password" });
    return;
  }
  await db.update(adminsTable)
    .set({ passwordHash: hashPassword(parsed.data.newPassword) })
    .where(eq(adminsTable.id, req.adminId!));
  res.json({ success: true });
});

// ─── Change Email ────────────────────────────────────────────────────────────
const ChangeEmailBody = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().email(),
});

router.patch("/auth/change-email", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangeEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { currentPassword, newEmail } = parsed.data;
  const normalizedEmail = newEmail.toLowerCase().trim();

  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, req.adminId!));
  if (!admin || !verifyPassword(currentPassword, admin.passwordHash)) {
    res.status(400).json({ error: "Invalid current password" });
    return;
  }

  // Check if new email is already taken by another account
  const [existing] = await db.select({ id: adminsTable.id })
    .from(adminsTable)
    .where(eq(adminsTable.email, normalizedEmail));
  if (existing && existing.id !== req.adminId) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  await db.update(adminsTable)
    .set({ email: normalizedEmail })
    .where(eq(adminsTable.id, req.adminId!));
  console.log(`[AUTH] Admin email changed: id=${req.adminId!} newEmail=${normalizedEmail}`);
  res.json({ email: normalizedEmail });
});

export default router;
