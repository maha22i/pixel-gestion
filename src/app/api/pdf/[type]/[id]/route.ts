import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { allocate } from "@/lib/schedule";
import { PAYMENT_METHODS, PROJECT_TYPES, today } from "@/lib/format";
import { amountInWords } from "@/lib/words";
import { invoicePdf, receiptPdf, type PdfLine } from "@/lib/pdf";
import { renderQuotePdf } from "@/lib/renderQuotePdf";
import { groupLines } from "@/components/DocLines";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function projectInfo(projectId: number | null) {
  if (!projectId) return null;
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return null;
  const ev = await db.execute(sql`
    SELECT et.name FROM project_event_types pet JOIN event_types et ON et.id = pet.event_type_id
    WHERE pet.project_id = ${projectId} ORDER BY et.position, et.name`);
  return { title: p.title, type: PROJECT_TYPES[p.type] ?? p.type, events: (ev.rows as any[]).map((r) => r.name) };
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

function pdfResponse(buf: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(_req: Request, { params }: { params: { type: string; id: string } }) {
  const user = await getUser();
  if (!user) return new NextResponse("Non authentifié", { status: 401 });
  const id = Number(params.id);
  const company = await getSettings();
  const events = Object.fromEntries((await db.select().from(schema.eventTypes)).map((e) => [e.id, e.name]));

  if (params.type === "devis") {
    if (!can(user, "devis")) return new NextResponse("Accès refusé", { status: 403 });
    const built = await renderQuotePdf(id);
    if (!built) return new NextResponse("Introuvable", { status: 404 });
    return pdfResponse(built.buf, built.filename);
  }

  if (params.type === "facture") {
    if (!can(user, "factures")) return new NextResponse("Accès refusé", { status: 403 });
    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
    if (!inv) return new NextResponse("Introuvable", { status: 404 });
    const items = await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, id)).orderBy(asc(schema.invoiceItems.position));
    const inst = await db.select().from(schema.installments).where(eq(schema.installments.invoiceId, id)).orderBy(asc(schema.installments.position));
    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
    const paidRes = await db.execute(sql`SELECT COALESCE(SUM(amount),0)::int AS paid FROM payments WHERE invoice_id = ${id}`);
    const paid = Number((paidRes.rows[0] as any).paid);
    const [quote] = inv.quoteId ? await db.select({ number: schema.quotes.number }).from(schema.quotes).where(eq(schema.quotes.id, inv.quoteId)) : [];
    const buf = await invoicePdf({
      company, client, number: inv.number, issueDate: inv.issueDate, subject: inv.subject, quoteNumber: quote?.number ?? null,
      project: await projectInfo(inv.projectId), lines: toLines(items, events), subtotal: inv.subtotal, discount: inv.discount,
      total: inv.total, paid, notes: inv.notes, words: amountInWords(inv.total), cancelled: inv.status === "annulee",
      schedule: allocate(inst, paid, today()),
    });
    return pdfResponse(buf, `Facture-${inv.number}.pdf`);
  }

  if (params.type === "recu") {
    if (!can(user, "paiements") && !can(user, "factures")) return new NextResponse("Accès refusé", { status: 403 });
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, id));
    if (!p) return new NextResponse("Introuvable", { status: 404 });
    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, p.invoiceId));
    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
    // cumul payé jusqu'à ce paiement inclus
    const cum = await db.execute(sql`
      SELECT COALESCE(SUM(amount),0)::int AS s FROM payments
      WHERE invoice_id = ${inv.id} AND (date < ${p.date}::date OR (date = ${p.date}::date AND id <= ${p.id}))`);
    const buf = await receiptPdf({
      company, client, number: p.receiptNumber, date: p.date, amount: p.amount, method: PAYMENT_METHODS[p.method] ?? p.method,
      reference: p.reference, invoiceNumber: inv.number, invoiceSubject: inv.subject, invoiceTotal: inv.total,
      paidToDate: Number((cum.rows[0] as any).s), words: amountInWords(p.amount), notes: p.notes,
    });
    return pdfResponse(buf, `Recu-${p.receiptNumber}.pdf`);
  }

  return new NextResponse("Type inconnu", { status: 404 });
}
