import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Génère un numéro de document au format PREFIX-YYYY-MMDD-XXX.
 * XXX est un compteur séquentiel annuel par type de document (remis à 001 chaque 1er janvier).
 */
export async function nextNumber(prefix: "PN" | "FAC" | "REC" | "CTR", isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  const key = `${prefix}-${y}`;
  const res = await db.execute(sql`
    INSERT INTO counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value
  `);
  const value = Number((res.rows[0] as { value: number }).value);
  const seq = String(value).padStart(3, "0");
  if (prefix === "CTR") return `PN-CTR-${y}-${seq}`;
  return `${prefix}-${y}-${m}${d}-${seq}`;
}
