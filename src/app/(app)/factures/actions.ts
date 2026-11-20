"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { nextNumber } from "@/lib/numbering";
import { lineRows, parsePayload } from "@/lib/docdata";
import { PAYMENT_METHODS, today } from "@/lib/format";
import { fileFrom, removeProof, storeProof } from "@/lib/proof";

function revalidateFinance(id?: number) {
  revalidatePath("/factures");
  revalidatePath("/paiements");
  revalidatePath("/");
  if (id) revalidatePath(`/factures/${id}`);
}

export async function createInvoice(fd: FormData) {
  const user = await requirePerm("factures", "write");
  const p = parsePayload(fd);
  const number = await nextNumber("FAC", p.issueDate);
  const id = await db.transaction(async (tx) => {
    const [inv] = await tx.insert(schema.invoices).values({
      number, clientId: p.clientId, projectId: p.projectId, subject: p.subject, issueDate: p.issueDate,
      discount: p.discount, subtotal: p.subtotal, total: p.total, notes: p.notes || null, createdBy: user.id,
    }).returning({ id: schema.invoices.id });
    await tx.insert(schema.invoiceItems).values(lineRows(p.lines).map((l) => ({ ...l, invoiceId: inv.id })));
    const dep = Math.round((p.total * p.depositPercent) / 100);
    if (dep > 0 && dep < p.total) {
      await tx.insert(schema.installments).values([
        { invoiceId: inv.id, label: `Acompte ${p.depositPercent} % à la commande`, amount: dep, dueDate: p.issueDate, position: 0 },
        { invoiceId: inv.id, label: "Solde à la livraison", amount: p.total - dep, dueDate: null, position: 1 },
      ]);
    } else {
      await tx.insert(schema.installments).values({ invoiceId: inv.id, label: "Paiement intégral", amount: p.total, dueDate: p.issueDate, position: 0 });
    }
    return inv.id;
  });
  revalidateFinance();
  redirect(`/factures/${id}`);
}

export async function updateInvoice(id: number, fd: FormData) {
  await requirePerm("factures", "write");
  const p = parsePayload(fd);
  const [old] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!old) redirect("/factures");
  const paidRes = await db.execute(sql`SELECT COALESCE(SUM(amount),0)::int AS paid FROM payments WHERE invoice_id = ${id}`);
  if (p.total < Number((paidRes.rows[0] as any).paid)) redirect(`/factures/${id}?e=total`);
  await db.transaction(async (tx) => {
    await tx.update(schema.invoices).set({
      clientId: p.clientId, projectId: p.projectId, subject: p.subject, issueDate: p.issueDate,
      discount: p.discount, subtotal: p.subtotal, total: p.total, notes: p.notes || null,
    }).where(eq(schema.invoices.id, id));
    await tx.delete(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, id));
    await tx.insert(schema.invoiceItems).values(lineRows(p.lines).map((l) => ({ ...l, invoiceId: id })));
    // Si le total change, l'échéancier est ajusté proportionnellement (le dernier versement absorbe l'arrondi).
    if (old.total !== p.total) {
      const inst = await tx.select().from(schema.installments).where(eq(schema.installments.invoiceId, id)).orderBy(asc(schema.installments.position));
      let acc = 0;
      for (let i = 0; i < inst.length; i++) {
        const amount = i === inst.length - 1 ? p.total - acc : Math.round(old.total ? (inst[i].amount * p.total) / old.total : p.total / inst.length);
        acc += amount;
        await tx.update(schema.installments).set({ amount }).where(eq(schema.installments.id, inst[i].id));
      }
    }
  });
  revalidateFinance(id);
  redirect(`/factures/${id}?ok=1`);
}

const instSchema = z.array(z.object({
  label: z.string().trim().min(1).max(200),
  amount: z.number().int().min(0),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})).min(1).max(24);

export async function saveInstallments(id: number, fd: FormData) {
  await requirePerm("factures", "write");
  const list = instSchema.parse(JSON.parse(String(fd.get("payload") ?? "[]")));
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  const sum = list.reduce((s, i) => s + i.amount, 0);
  if (!inv || sum !== inv.total) redirect(`/factures/${id}?e=echeancier`);
  await db.transaction(async (tx) => {
    await tx.delete(schema.installments).where(eq(schema.installments.invoiceId, id));
    await tx.insert(schema.installments).values(list.map((l, i) => ({ ...l, invoiceId: id, position: i })));
  });
  revalidateFinance(id);
  redirect(`/factures/${id}?ok=echeancier`);
}

export async function setInvoiceCancelled(id: number, cancelled: boolean) {
  await requirePerm("factures", "write");
  if (cancelled) {
    const res = await db.execute(sql`SELECT count(*)::int AS n FROM payments WHERE invoice_id = ${id}`);
    if ((res.rows[0] as any).n > 0) redirect(`/factures/${id}?e=paiements`);
  }
  await db.update(schema.invoices).set({ status: cancelled ? "annulee" : "emise" }).where(eq(schema.invoices.id, id));
  revalidateFinance(id);
  redirect(`/factures/${id}`);
}

export async function deleteInvoice(id: number) {
  await requirePerm("factures", "write");
  const res = await db.execute(sql`SELECT count(*)::int AS n FROM payments WHERE invoice_id = ${id}`);
  if ((res.rows[0] as any).n > 0) redirect(`/factures/${id}?e=paiements`);
  await db.delete(schema.invoices).where(eq(schema.invoices.id, id));
  revalidateFinance();
  redirect("/factures");
}

// ─── Paiements ───────────────────────────────────────────────────────────
export async function addPayment(invoiceId: number, fd: FormData) {
  const user = await requirePerm("paiements", "write");
  const amount = Math.round(Number(String(fd.get("amount") ?? "").replace(/\s/g, "")));
  const date = String(fd.get("date") ?? "") || today();
  const method = String(fd.get("method") ?? "");
  if (!(amount > 0) || !(method in PAYMENT_METHODS) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(`/factures/${invoiceId}?e=paiement`);
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!inv || inv.status === "annulee") redirect(`/factures/${invoiceId}?e=paiement`);
  const res = await db.execute(sql`SELECT COALESCE(SUM(amount),0)::int AS paid FROM payments WHERE invoice_id = ${invoiceId}`);
  const paid = Number((res.rows[0] as any).paid);
  if (paid + amount > inv.total) redirect(`/factures/${invoiceId}?e=trop`);
  const receiptNumber = await nextNumber("REC", date);
  const file = fileFrom(fd);
  const saved = file ? await storeProof(file) : null;
  if (saved && !saved.ok) redirect(`/factures/${invoiceId}?e=${saved.code}`);
  await db.insert(schema.payments).values({
    invoiceId, amount, date, method, receiptNumber, createdBy: user.id,
    reference: String(fd.get("reference") ?? "").trim() || null,
    notes: String(fd.get("notes") ?? "").trim() || null,
    ...(saved?.ok ? saved.proof : {}),
  });
  revalidateFinance(invoiceId);
  redirect(`/factures/${invoiceId}?ok=paiement`);
}

export async function deletePayment(paymentId: number) {
  await requirePerm("paiements", "write");
  const [p] = await db.delete(schema.payments).where(eq(schema.payments.id, paymentId)).returning({
    invoiceId: schema.payments.invoiceId,
    proofStored: schema.payments.proofStored,
  });
  await removeProof(p?.proofStored);
  revalidateFinance(p?.invoiceId);
  redirect(p ? `/factures/${p.invoiceId}` : "/paiements");
}
