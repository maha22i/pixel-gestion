import "server-only";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/auth";
export { CONDITIONS, AVAILABILITY } from "./equipmentLabels";

export const FILE_MAX = 15 * 1024 * 1024;
const DIR = path.join(process.cwd(), "data", "equipment-files");

export function seesPrices(user: SessionUser) {
  return can(user, "materiel", "write");
}

export function canOperate(user: SessionUser) {
  return can(user, "materiel");
}

export async function nextEquipmentRef() {
  const res = await db.execute(sql`
    INSERT INTO counters (key, value) VALUES ('PN-MAT', 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value`);
  const value = Number((res.rows[0] as { value: number }).value);
  return `PN-MAT-${String(value).padStart(3, "0")}`;
}

export async function saveEquipmentFile(file: File, equipmentId: number, userId: number, kind: "photo" | "facture") {
  if (file.size === 0 || file.size > FILE_MAX) throw new Error("taille");
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.promises.mkdir(DIR, { recursive: true });
  const storedName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.promises.writeFile(path.join(DIR, storedName), buf);
  const [row] = await db.insert(schema.equipmentFiles).values({
    equipmentId,
    kind,
    filename: file.name || (kind === "photo" ? "photo" : "facture"),
    storedName,
    mime: file.type || "application/octet-stream",
    size: file.size,
    uploadedBy: userId,
  }).returning();
  return row;
}

export function equipmentFilePath(storedName: string) {
  return path.join(DIR, storedName);
}

export async function openCheckout(equipmentId: number) {
  const res = await db.execute(sql`
    SELECT id FROM equipment_events
    WHERE equipment_id = ${equipmentId} AND kind = 'sortie' AND return_date IS NULL
    ORDER BY id DESC LIMIT 1`);
  return (res.rows[0] as { id: number } | undefined) ?? null;
}
