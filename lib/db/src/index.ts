import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

export * from "./schema/index.js";

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

const NEON_DB_URL = "postgresql://neondb_owner:npg_TWZsX7oLVi9l@ep-autumn-leaf-ayseso07-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require";

export function getDb() {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL || process.env.PGDATABASE_URL || NEON_DB_URL;
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("neon.tech") || connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}
