import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

export * from "./schema/index.js";

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL || process.env.PGDATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL must be set.");
    }
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
