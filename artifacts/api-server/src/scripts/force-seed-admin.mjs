/**
 * Force-upsert admin credentials into the database.
 * Pure ESM, no build needed.
 */
import { createHash, randomBytes } from "crypto";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

// Resolve pg from lib/db since api-server doesn't have it directly
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Try to find pg in the monorepo
let pg;
try {
  pg = require(join(__dirname, "../../../../../lib/db/node_modules/pg"));
} catch {
  pg = require("pg");
}
const { Client } = pg;

function hashPassword(password) {
  return createHash("sha256").update(password + "dhd_salt_2024").digest("hex");
}

function generateQrCode() {
  return "dhd-auth-" + randomBytes(16).toString("hex");
}

function generateSerial(prefix) {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${digits}`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ Connected to database.");

  const email = "meradex.express16@gmail.com";
  const password = "200211ha";
  const passwordHash = hashPassword(password);

  // Check if admin exists
  const res = await client.query("SELECT id, serial_number, qr_code_data FROM admins WHERE email = $1", [email]);

  if (res.rows.length === 0) {
    const serial = generateSerial("ADM");
    const qr = generateQrCode();
    await client.query(
      `INSERT INTO admins (username, email, password_hash, first_name, last_name, serial_number, qr_code_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ["admin", email, passwordHash, "Admin", "DHD", serial, qr]
    );
    console.log("✅ Admin inserted.");
    console.log("   Serial:", serial);
    console.log("   QR data:", qr);
  } else {
    const admin = res.rows[0];
    const serial = admin.serial_number || generateSerial("ADM");
    const qr = admin.qr_code_data || generateQrCode();
    await client.query(
      `UPDATE admins SET password_hash = $1, serial_number = $2, qr_code_data = $3 WHERE email = $4`,
      [passwordHash, serial, qr, email]
    );
    console.log("✅ Admin updated with correct password hash.");
    console.log("   Serial:", serial);
    console.log("   QR data:", qr);
  }

  // Print all admins
  const all = await client.query("SELECT id, username, email, serial_number FROM admins ORDER BY id");
  console.log("\n📋 Admins in DB:");
  all.rows.forEach(r => console.log(`  [${r.id}] ${r.email} | serial: ${r.serial_number}`));

  // Print employees
  const emp = await client.query("SELECT COUNT(*) as cnt FROM employees");
  console.log(`\n👥 Total employees in DB: ${emp.rows[0].cnt}`);

  const empRows = await client.query("SELECT id, first_name, last_name, serial_number FROM employees ORDER BY id LIMIT 20");
  empRows.rows.forEach(r => console.log(`  [${r.id}] ${r.first_name} ${r.last_name} | serial: ${r.serial_number}`));

  await client.end();
  console.log("\n✅ Done.");
}

main().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
