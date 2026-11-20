"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { nextNumber } from "@/lib/numbering";
import { lineRows, parsePayload } from "@/lib/docdata";
import { QUOTE_STATUS, addDays, today } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { appOrigin, ensureSignToken, quoteInviteText, signUrl, whatsappDigits } from "@/lib/sign";
import { sendQuoteEmail, smtpReady } from "@/lib/mail";
import { renderQuotePdf } from "@/lib/renderQuotePdf";

export async function createQuote(fd: FormData) {
  const user = await requirePerm("devis", "write");
  const p = parsePayload(fd);
  const number = await nextNumber("PN", p.issueDate);
  const id = await db.transaction(async (tx) => {
    const [q] = await tx.insert(schema.quotes).values({
      number, clientId: p.clientId, projectId: p.projectId, subject: p.subject, issueDate: p.issueDate,
      validUntil: p.validUntil, discount: p.discount, depositPercent: p.depositPercent, subtotal: p.subtotal,
      total: p.total, notes: p.notes || null, createdBy: user.id,
    }).returning({ id: schema.quotes.id });
    await tx.insert(schema.quoteItems).values(lineRows(p.lines).map((l) => ({ ...l, quoteId: q.id })));
    return q.id;
  });
  revalidatePath("/devis");
  redirect(`/devis/${id}`);
}

export async function updateQuote(id: number, fd: FormData) {
  await requirePerm("devis", "write");
  const [existing] = await db.select({ signedAt: schema.quotes.signedAt }).from(schema.quotes).where(eq(schema.quotes.id, id));
  if (existing?.signedAt) redirect(`/devis/${id}?e=signe`);
  const p = parsePayload(fd);
  await db.transaction(async (tx) => {
    await tx.update(schema.quotes).set({
      clientId: p.clientId, projectId: p.projectId, subject: p.subject, issueDate: p.issueDate, validUntil: p.validUntil,
      discount: p.discount, depositPercent: p.depositPercent, subtotal: p.subtotal, total: p.total, notes: p.notes || null,
    }).where(eq(schema.quotes.id, id));
    await tx.delete(schema.quoteItems).where(eq(schema.quoteItems.quoteId, id));
    await tx.insert(schema.quoteItems).values(lineRows(p.lines).map((l) => ({ ...l, quoteId: id })));
  });
  revalidatePath(`/devis/${id}`);
  redirect(`/devis/${id}?ok=1`);
}

export async function setQuoteStatus(id: number, status: string) {
  await requirePerm("devis", "write");
  if (!(status in QUOTE_STATUS)) return;
  await db.update(schema.quotes).set({ status }).where(eq(schema.quotes.id, id));
  revalidatePath(`/devis/${id}`);
  revalidatePath("/devis");
}

export async function duplicateQuote(id: number) {
  const user = await requirePerm("devis", "write");
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
  if (!q) redirect("/devis");
  const items = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, id)).orderBy(asc(schema.quoteItems.position));
  const st = await getSettings();
  const d = today();
  const number = await nextNumber("PN", d);
  const [n] = await db.insert(schema.quotes).values({
    number, clientId: q.clientId, projectId: q.projectId, subject: q.subject, issueDate: d, validUntil: addDays(d, st.quoteValidityDays),
    discount: q.discount, depositPercent: q.depositPercent, subtotal: q.subtotal, total: q.total, notes: q.notes, createdBy: user.id,
  }).returning({ id: schema.quotes.id });
  if (items.length) await db.insert(schema.quoteItems).values(items.map(({ id: _id, quoteId: _q, ...rest }) => ({ ...rest, quoteId: n.id })));
  redirect(`/devis/${n.id}/modifier`);
}

export async function deleteQuote(id: number) {
  await requirePerm("devis", "write");
  const inv = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.quoteId, id));
  if (inv.length) redirect(`/devis/${id}?e=facture`);
  await db.delete(schema.quotes).where(eq(schema.quotes.id, id));
  revalidatePath("/devis");
  redirect("/devis");
}

async function quoteDelivery(id: number) {
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
  if (!q) return null;
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, q.clientId));
  const st = await getSettings();
  const token = await ensureSignToken(id);
  if (!token || !client) return null;
  const url = signUrl(appOrigin(st.appUrl), token);
  const text = quoteInviteText({ clientName: client.name, number: q.number, subject: q.subject, company: st.companyName, url });
  return { q, client, st, url, text };
}

async function markSent(id: number, via: "email" | "whatsapp" | "both", status: string) {
  await db.update(schema.quotes).set({
    sentAt: new Date(),
    sentVia: via,
    ...(status === "brouillon" ? { status: "envoye" } : {}),
  }).where(eq(schema.quotes.id, id));
  revalidatePath(`/devis/${id}`);
  revalidatePath("/devis");
}

/** E-mail si la fiche en a un, et WhatsApp dès qu'un numéro est utilisable. Les champs du formulaire sont enregistrés sur la fiche client. */
export async function sendQuoteNow(id: number, fd: FormData) {
  await requirePerm("devis", "write");
  const typedEmail = String(fd.get("email") ?? "").trim();
  const typedPhone = String(fd.get("phone") ?? "").trim();
  const pack = await quoteDelivery(id);
  if (!pack) redirect("/devis");

  const patch: { email?: string; phone?: string } = {};
  if (typedEmail) patch.email = typedEmail;
  if (typedPhone) patch.phone = typedPhone;
  if (Object.keys(patch).length) {
    await db.update(schema.clients).set(patch).where(eq(schema.clients.id, pack.client.id));
    revalidatePath(`/clients/${pack.client.id}`);
  }

  const email = (typedEmail || pack.client.email || "").trim();
  const phone = typedPhone || pack.client.phone || "";
  const digits = whatsappDigits(phone);
  let mailed = false;
  if (email.includes("@")) {
    if (!smtpReady(pack.st)) {
      if (!digits) redirect(`/devis/${id}?e=smtp`);
    } else {
      let pdf: { filename: string; content: Buffer } | undefined;
      try {
        const built = await renderQuotePdf(id);
        if (built) pdf = { filename: built.filename, content: built.buf };
      } catch (err) {
        console.error("pdf devis", err instanceof Error ? err.message : err);
      }
      try {
        await sendQuoteEmail(pack.st, email, {
          clientName: pack.client.name, number: pack.q.number, subject: pack.q.subject, url: pack.url, text: pack.text,
        }, pdf);
        mailed = true;
      } catch (err) {
        console.error("smtp", err instanceof Error ? err.message : err);
        if (!digits) redirect(`/devis/${id}?e=smtp`);
      }
    }
  }
  if (digits) {
    await markSent(id, mailed ? "both" : "whatsapp", pack.q.status);
    redirect(`/devis/${id}?ok=${mailed ? "both" : "whatsapp"}`);
  }
  if (mailed) {
    await markSent(id, "email", pack.q.status);
    redirect(`/devis/${id}?ok=email`);
  }
  redirect(`/devis/${id}?e=contact`);
}

/** Transforme un devis en facture (1 clic) : copie des lignes + échéancier acompte/solde. */
export async function convertToInvoice(id: number) {
  const user = await requirePerm("factures", "write");
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
  if (!q) redirect("/devis");
  const existing = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.quoteId, id));
  if (existing.length) redirect(`/factures/${existing[0].id}`);
  const items = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, id)).orderBy(asc(schema.quoteItems.position));
  const d = today();
  const number = await nextNumber("FAC", d);
  let endDate: string | null = null;
  if (q.projectId) {
    const [p] = await db.select({ endDate: schema.projects.endDate, startDate: schema.projects.startDate }).from(schema.projects).where(eq(schema.projects.id, q.projectId));
    endDate = p?.endDate ?? p?.startDate ?? null;
  }
  const invId = await db.transaction(async (tx) => {
    const [inv] = await tx.insert(schema.invoices).values({
      number, quoteId: q.id, clientId: q.clientId, projectId: q.projectId, subject: q.subject, issueDate: d,
      discount: q.discount, subtotal: q.subtotal, total: q.total, notes: q.notes, createdBy: user.id,
    }).returning({ id: schema.invoices.id });
    if (items.length)
      await tx.insert(schema.invoiceItems).values(items.map(({ id: _id, quoteId: _q, ...rest }) => ({ ...rest, invoiceId: inv.id })));
    const dep = Math.round((q.total * q.depositPercent) / 100);
    const inst = [];
    if (dep > 0 && dep < q.total) {
      inst.push({ invoiceId: inv.id, label: `Acompte ${q.depositPercent} % à la commande`, amount: dep, dueDate: d, position: 0 });
      inst.push({ invoiceId: inv.id, label: "Solde à la livraison", amount: q.total - dep, dueDate: endDate, position: 1 });
    } else {
      inst.push({ invoiceId: inv.id, label: "Paiement intégral", amount: q.total, dueDate: d, position: 0 });
    }
    await tx.insert(schema.installments).values(inst);
    await tx.update(schema.quotes).set({ status: "accepte" }).where(eq(schema.quotes.id, q.id));
    // Un devis converti confirme le projet s'il était encore en prospect
    if (q.projectId)
      await tx.update(schema.projects).set({ status: "confirme" })
        .where(and(eq(schema.projects.id, q.projectId), eq(schema.projects.status, "prospect")));
    return inv.id;
  });
  revalidatePath("/factures");
  revalidatePath(`/devis/${id}`);
  redirect(`/factures/${invId}`);
}
