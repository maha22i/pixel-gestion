import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function getSettings() {
  const [s] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  if (s) return s;
  const [created] = await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(schema.settings).where(eq(schema.settings.id, 1)))[0];
}
