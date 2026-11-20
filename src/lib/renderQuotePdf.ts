import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { PROJECT_TYPES, dateFr } from "@/lib/format";
import { amountInWords } from "@/lib/words";
import { quotePdf, type PdfLine } from "@/lib/pdf";
import { groupLines } from "@/components/DocLines";
import { signaturePng } from "@/lib/sign";

async function projectInfo(projectId: number | null) {
  if (!projectId) return null;
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return null;
  const ev = await db.execute(sql`
    SELECT et.name FROM project_event_types pet JOIN event_types et ON et.id = pet.event_type_id
    WHERE pet.project_id = ${projectId} ORDER BY et.position, et.name`);
  return { title: p.title, type: PROJECT_TYPES[p.type] ?? p.type, events: (ev.rows as { name: string }[]).map((r) => r.name) };
}

function toLines(rows: { eventTypeId: number | null; designation: string; description: string | null; quantity: string; unit: string | null; unitPrice: number; discountPct: number; total: number }[], events: Record<number, string>): PdfLine[] {
  const hasEvents = rows.some((r) => r.eventTypeId != null);
  return groupLines(rows).flatMap((g) =>
    g.lines.map((r) => ({
      designation: r.designation, description: r.description, quantity: Number(r.quantity), unit: r.unit,
      unitPrice: r.unitPrice, discountPct: r.discountPct, total: r.total,
      group: hasEvents ? (r.eventTypeId ? events[r.eventTypeId] ?? "Événement" : null) : undefined,
    }))
  );
}

export async function renderQuotePdf(id: number) {
  const company = await getSettings();
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
  if (!q) return null;
  const items = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, id)).orderBy(asc(schema.quoteItems.position));
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, q.clientId));
  const events = Object.fromEntries((await db.select().from(schema.eventTypes)).map((e) => [e.id, e.name]));
  const png = signaturePng(q.signatureData);
  const buf = await quotePdf({
    company, client, number: q.number, issueDate: q.issueDate, validUntil: q.validUntil, subject: q.subject,
    project: await projectInfo(q.projectId), lines: toLines(items, events), subtotal: q.subtotal, discount: q.discount,
    total: q.total, depositPercent: q.depositPercent, notes: q.notes, words: amountInWords(q.total),
    clientSign: png && q.signerName && q.signedAt ? { png, name: q.signerName, when: dateFr(q.signedAt) } : null,
  });
  return { buf, filename: `Devis-${q.number}.pdf`, quote: q };
}
