import "server-only";
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, today } from "@/lib/format";

export const SIGNED_MAX = 15 * 1024 * 1024;
const DIR = path.join(process.cwd(), "data", "verification-files");

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lundi de la semaine qui contient la date (semaine du lundi au dimanche). */
export function mondayOf(iso: string) {
  const d = new Date(iso + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

export function currentWeekStart() {
  return mondayOf(today());
}

export function weekEnd(start: string) {
  return addDays(start, 6);
}

export function weekRangeLabel(start: string) {
  const end = weekEnd(start);
  const a = new Date(start + "T12:00:00");
  const b = new Date(end + "T12:00:00");
  const dayMonth: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  const left = a.toLocaleDateString("fr-FR", a.getFullYear() === b.getFullYear() ? dayMonth : { ...dayMonth, year: "numeric" });
  const right = b.toLocaleDateString("fr-FR", { ...dayMonth, year: "numeric" });
  return `du ${left} au ${right}`;
}

/** Semaine passée ou en cours, toujours ramenée au lundi. */
export function parseWeekStart(raw: string | null | undefined) {
  const v = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const monday = mondayOf(v);
  if (monday > currentWeekStart()) return null;
  return monday;
}

export function recentMondays(count = 12) {
  const current = currentWeekStart();
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(addDays(current, -7 * i));
  return out;
}

export type EquipmentSnapshot = {
  id: number;
  ref: string;
  name: string;
  category: string;
  location: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  quantity: number;
  condition: string;
  availability: string;
};

export async function loadEquipmentSnapshot(): Promise<EquipmentSnapshot[]> {
  const res = await db.execute(sql`
    SELECT e.id, e.ref, e.name, e.brand, e.model, e.serial_number, e.quantity,
      e.condition, e.availability,
      COALESCE(ch.name || ' › ' || c.name, c.name, '') AS category,
      COALESCE(l.name, '') AS location
    FROM equipment e
    LEFT JOIN equipment_categories c ON c.id = e.category_id
    LEFT JOIN equipment_categories ch ON ch.id = c.parent_id
    LEFT JOIN equipment_locations l ON l.id = e.location_id
    ORDER BY category, e.name, e.ref`);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    ref: String(r.ref),
    name: String(r.name),
    category: String(r.category ?? ""),
    location: String(r.location ?? ""),
    brand: r.brand == null ? null : String(r.brand),
    model: r.model == null ? null : String(r.model),
    serialNumber: r.serial_number == null ? null : String(r.serial_number),
    quantity: Number(r.quantity) || 1,
    condition: String(r.condition),
    availability: String(r.availability),
  }));
}

export function lineValues(verificationId: number, rows: EquipmentSnapshot[]) {
  return rows.map((r, i) => ({
    verificationId,
    equipmentId: r.id,
    ref: r.ref,
    name: r.name,
    category: r.category,
    location: r.location,
    brand: r.brand,
    model: r.model,
    serialNumber: r.serialNumber,
    quantity: r.quantity,
    condition: r.condition,
    availability: r.availability,
    position: i,
  }));
}

export function equipmentTitle(row: { name: string; brand?: string | null; model?: string | null; serialNumber?: string | null }) {
  const bits = [row.name];
  const extra = [row.brand, row.model].filter(Boolean).join(" ");
  if (extra) bits.push(extra);
  if (row.serialNumber) bits.push(`n° ${row.serialNumber}`);
  return bits.join(" · ");
}

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export function signedMime(file: File) {
  if (ALLOWED.has(file.type)) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  return null;
}

export async function saveSignedFile(file: File) {
  const mime = signedMime(file);
  if (!mime || file.size <= 0 || file.size > SIGNED_MAX) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.promises.mkdir(DIR, { recursive: true });
  const storedName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.promises.writeFile(path.join(DIR, storedName), buf);
  return { mime, storedName, filename: file.name || "verification-signee", size: file.size };
}

export function signedFilePath(storedName: string) {
  const full = path.join(DIR, storedName);
  if (path.dirname(full) !== DIR) return null;
  return full;
}

export async function removeStoredFile(storedName: string | null | undefined) {
  if (!storedName) return;
  const full = signedFilePath(storedName);
  if (full) await fs.promises.unlink(full).catch(() => {});
}

export async function findVerification(id: number) {
  const [row] = await db.select().from(schema.equipmentVerifications).where(eq(schema.equipmentVerifications.id, id));
  return row ?? null;
}
