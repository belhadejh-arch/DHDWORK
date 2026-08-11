import { db, adminsTable, officesTable } from "@workspace/db";
import { hashPassword, generateUniqueSerialNumber, generateUniqueQrCodeData } from "./auth";
import { logger } from "./logger";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

function generateOfficeQrData(): string {
  return `DHD-OFFICE-${randomBytes(16).toString("hex")}`;
}

/**
 * Seeds essential data (admin account + offices) on first startup.
 * Safe to call every startup — uses ON CONFLICT DO NOTHING.
 */
export async function seedDatabase(): Promise<void> {
  try {
    // Two fixed offices with Arabic names and QR codes
    const officeDefaults = [
      { name: "مكتب أم البواقي", address: "أم البواقي، الجزائر", latitude: 35.8707722, longitude: 7.1101606 },
      { name: "مكتب عين فكرون", address: "عين فكرون، أم البواقي، الجزائر", latitude: 35.9700208, longitude: 6.8771648 },
    ];

    for (const offDef of officeDefaults) {
      const existing = await db.select().from(officesTable).where(eq(officesTable.name, offDef.name));
      if (existing.length === 0) {
        await db.insert(officesTable).values({ ...offDef, qrCodeData: generateOfficeQrData() });
        logger.info({ name: offDef.name }, "Office seeded");
      } else {
        // Backfill missing QR code
        const off = existing[0];
        if (!off.qrCodeData) {
          await db.update(officesTable).set({ qrCodeData: generateOfficeQrData(), address: offDef.address }).where(eq(officesTable.id, off.id));
          logger.info({ name: offDef.name }, "Office QR code backfilled");
        } else {
          // Update address in case it was missing
          await db.update(officesTable).set({ address: offDef.address }).where(eq(officesTable.id, off.id));
        }
      }
    }

    // Remove old English-named offices if they exist
    await db.delete(officesTable).where(eq(officesTable.name, "Oum El Bouaghi"));
    await db.delete(officesTable).where(eq(officesTable.name, "Ain El Fekroun"));

    // Default admin — seed on first run only; never overwrite existing credentials
    const existingAdmin = await db.select().from(adminsTable).where(eq(adminsTable.email, "meradex.express16@gmail.com"));
    if (existingAdmin.length === 0) {
      const serialNumber = await generateUniqueSerialNumber("ADM");
      const qrCodeData = await generateUniqueQrCodeData();
      await db.insert(adminsTable).values({
        username: "admin",
        email: "meradex.express16@gmail.com",
        passwordHash: hashPassword("DHD@Admin2024"),
        firstName: "Admin",
        lastName: "DHD",
        serialNumber,
        qrCodeData,
        isPrimary: true,
      }).onConflictDoNothing();
      logger.info({ serialNumber }, "Admin seeded with serial number and QR code");
    } else {
      // Only backfill missing serial/QR — never touch the password
      const admin = existingAdmin[0];
      const updates: Record<string, string> = {};
      if (!admin.serialNumber) updates.serialNumber = await generateUniqueSerialNumber("ADM");
      if (!admin.qrCodeData) updates.qrCodeData = await generateUniqueQrCodeData();
      if (Object.keys(updates).length > 0) {
        await db.update(adminsTable).set(updates).where(eq(adminsTable.id, admin.id));
        logger.info(updates, "Admin backfilled missing serial/QR");
      } else {
        logger.info("Admin already exists — no changes needed");
      }
    }

    logger.info("Database seeded (admin + offices)");
  } catch (err) {
    logger.error({ err }, "Seed failed — continuing anyway");
  }
}
