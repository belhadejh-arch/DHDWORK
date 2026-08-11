/**
 * Force-upsert admin credentials into the database.
 * Run: npx tsx src/scripts/force-seed-admin.ts
 */
import { createHash, randomBytes } from "crypto";
import pg from "pg";

const { Client } = pg;

function hashPassword(password: string): string {
  return createHash("sha256").update(password + "dhd_salt_2024").digest("hex");
}

function generateQrCode(): string {
  return "dhd-auth-" + randomBytes(16).toString("hex");
}

function generateSerial(prefix: string): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${digits}`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to database.");

  const email = "meradex.express16@gmail.com";
  const password = "200211ha";
  const passwordHash = hashPassword(password);

  // Check if admin exists
  const res = await client.query("SELECT id, serial_number, qr_code_data FROM admins WHERE email = $1", [email]);

  if (res.rows.length === 0) {
    // Insert fresh
    const serial = generateSerial("ADM");
    const qr = generateQrCode();
    await client.query(
      `INSERT INTO admins (username, email, password_hash, first_name, last_name, serial_number, qr_code_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ["admin", email, passwordHash, "Admin", "DHD", serial, qr]
    );
    console.log("✅ Admin inserted.");
    console.log("   Email:", email);
    console.log("   Password:", password);
    console.log("   Serial:", serial);
    console.log("   QR data:", qr);
  } else {
    // Update password + fill missing serial/qr
    const admin = res.rows[0];
    const serial = admin.serial_number || generateSerial("ADM");
    const qr = admin.qr_code_data || generateQrCode();
    await client.query(
      `UPDATE admins SET password_hash = $1, serial_number = $2, qr_code_data = $3 WHERE email = $4`,
      [passwordHash, serial, qr, email]
    );
    console.log("✅ Admin updated.");
    console.log("   Email:", email);
    console.log("   Password:", password);
    console.log("   Serial:", serial);
    console.log("   QR data:", qr);
  }

  // Print all admins
  const all = await client.query("SELECT id, username, email, serial_number, qr_code_data FROM admins ORDER BY id");
  console.log("\n📋 All admins in DB:");
  console.table(all.rows);

  // Print all employees count
  const emp = await client.query("SELECT COUNT(*) FROM employees");
  console.log(`\n👥 Total employees in DB: ${emp.rows[0].count}`);

  await client.end();
  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
