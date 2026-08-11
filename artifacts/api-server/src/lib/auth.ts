import { createHash, randomBytes } from "crypto";
import { db, sessionsTable, employeesTable, adminsTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — persistent login

export function hashPassword(password: string): string {
  return createHash("sha256").update(password + "dhd_salt_2024").digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export async function createSession(userType: "admin" | "employee", userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessionsTable).values({ token, userType, userId, expiresAt });
  return token;
}

export async function getSession(token: string): Promise<{ userType: string; userId: number } | null> {
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token));
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
    return null;
  }
  return { userType: session.userType, userId: session.userId };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
}

/** Single-device policy: remove all existing sessions for a user before creating a new one. */
export async function deleteSessionsForUser(userType: "admin" | "employee", userId: number): Promise<void> {
  await db.delete(sessionsTable).where(and(eq(sessionsTable.userType, userType), eq(sessionsTable.userId, userId)));
}

export async function cleanupExpiredSessions(): Promise<void> {
  await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date()));
}

export function getTokenFromRequest(req: { headers: { authorization?: string } }): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/** Generate a unique serial number for a user. Format: EMP-XXXXXX or ADM-XXXXXX */
export async function generateUniqueSerialNumber(type: "EMP" | "ADM"): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const digits = Math.floor(100000 + Math.random() * 900000).toString();
    const serial = `${type}-${digits}`;
    // Check uniqueness across both tables
    const [empDup] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.serialNumber, serial));
    const [admDup] = await db.select({ id: adminsTable.id }).from(adminsTable).where(eq(adminsTable.serialNumber, serial));
    if (!empDup && !admDup) return serial;
  }
  throw new Error("Could not generate unique serial number");
}

/** Generate a unique QR code data token (the payload stored in and read from QR images). */
export async function generateUniqueQrCodeData(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const token = "dhd-auth-" + randomBytes(16).toString("hex");
    const [empDup] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.qrCodeData, token));
    const [admDup] = await db.select({ id: adminsTable.id }).from(adminsTable).where(eq(adminsTable.qrCodeData, token));
    if (!empDup && !admDup) return token;
  }
  throw new Error("Could not generate unique QR code data");
}
