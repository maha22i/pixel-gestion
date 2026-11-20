import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { docTotals, lineTotal, type Line } from "./calc";

/** Données de référence nécessaires à l'éditeur de devis/factures. */
export async function editorData() {
  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name));
  const projectsRaw = await db.select({ id: schema.projects.id, title: schema.projects.title, clientId: schema.projects.clientId, type: schema.projects.type })
    .from(schema.projects).orderBy(asc(schema.projects.title));
  const pet = await db.select().from(schema.projectEventTypes);
  const projects = projectsRaw.map((p) => ({ ...p, eventTypeIds: pet.filter((x) => x.projectId === p.id).map((x) => x.eventTypeId) }));
  const catalog = await db.select().from(schema.catalogItems).where(eq(schema.catalogItems.active, true))
    .orderBy(asc(schema.catalogItems.category), asc(schema.catalogItems.name));
  const eventTypes = await db.select({
    id: schema.eventTypes.id,
    name: schema.eventTypes.name,
    description: schema.eventTypes.description,
    priceDjibouti: schema.eventTypes.priceDjibouti,
    priceRegions: schema.eventTypes.priceRegions,
  }).from(schema.eventTypes)
    .where(eq(schema.eventTypes.active, true)).orderBy(asc(schema.eventTypes.position));
  return { clients, projects, catalog, eventTypes };
}

const lineSchema = z.object({
  catalogItemId: z.number().int().nullable(),
  eventTypeId: z.number().int().nullable(),
  designation: z.string().trim().min(1).max(300),
  description: z.string().max(2000).default(""),
  quantity: z.number().min(0).max(1_000_000),
  unit: z.string().max(40).default(""),
  unitPrice: z.number().min(0).max(10_000_000_000),
  discountPct: z.number().min(0).max(100),
});

const payloadSchema = z.object({
  clientId: z.number().int(),
  projectId: z.number().int().nullable(),
  subject: z.string().trim().min(1).max(300),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  discount: z.number().min(0),
  depositPercent: z.number().int().min(0).max(100),
  notes: z.string().max(5000).default(""),
  lines: z.array(lineSchema).min(1).max(200),
});

export type DocPayload = z.infer<typeof payloadSchema>;

export function parsePayload(fd: FormData) {
  const raw = JSON.parse(String(fd.get("payload") ?? "{}"));
  const p = payloadSchema.parse(raw);
  const lines = p.lines.map((l, i) => ({
    ...l,
    unitPrice: Math.round(l.unitPrice),
    total: lineTotal(l.quantity, l.unitPrice, l.discountPct),
    position: i,
  }));
  const t = docTotals(lines as Line[], p.discount);
  return { ...p, lines, ...t };
}

export function rowToLine(r: {
  catalogItemId: number | null; eventTypeId: number | null; designation: string; description: string | null;
  quantity: string; unit: string | null; unitPrice: number; discountPct: number;
}): Line {
  return {
    catalogItemId: r.catalogItemId, eventTypeId: r.eventTypeId, designation: r.designation,
    description: r.description ?? "", quantity: Number(r.quantity), unit: r.unit ?? "", unitPrice: r.unitPrice, discountPct: r.discountPct,
  };
}

export function lineRows<T extends { quantity: number }>(lines: T[]) {
  return lines.map((l) => ({ ...l, quantity: String(l.quantity) }));
}
