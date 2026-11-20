import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool; databaseUrl?: string };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL manquant : l'application ne doit pas se connecter à la base par défaut du système.");
}

if (globalForDb.pool && globalForDb.databaseUrl !== databaseUrl) {
  void globalForDb.pool.end();
  globalForDb.pool = undefined;
}

const pool =
  globalForDb.pool ??
  new Pool({ connectionString: databaseUrl, max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
  globalForDb.databaseUrl = databaseUrl;
}

export const db = drizzle(pool, { schema });
export { schema };
