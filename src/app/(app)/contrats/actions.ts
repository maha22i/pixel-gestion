"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, can, getUser } from "@/lib/auth";
import { nextNumber } from "@/lib/numbering";
import { parseDraft, clientSnapshot } from "@/lib/contractData";
import type { Block } from "@/lib/contractModel";

function sourceToBlocks(source: string): Block[] {
  const chunks = source.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return chunks.map((chunk) => {
    const table = chunk.match(/^\[tableau:(services|definitions|prices|custom)\]$/);
    if (table) return { type: "table", id: table[1] } as Block;
    const lines = chunk.split("\n");
    if (lines.every((l) => l.startsWith("- "))) return { type: "ul", items: lines.map((l) => l.slice(2)) };
    if (lines.every((l) => l.startsWith("§ "))) return { type: "subs", items: lines.map((l) => ({ text: l.slice(2) })) };
    return { type: "p", text: chunk };
  });
}
import { nextDay } from "@/lib/contractModel";

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function writeClient(d: ReturnType<typeof parseDraft>, userCan: boolean) {
  const values = {
    type: d.clientType || "entreprise",
    name: d.clientName || "Sans nom",
    acronym: d.clientAcronym || null,
    nif: d.clientNif || null,
    address: d.clientAddress || null,
    repCivility: d.repCivility || null,
    repName: d.repName || null,
    repTitle: d.repTitle || null,
    contactName: d.contactName || null,
    contactRole: d.contactRole || null,
    phone: d.contactPhone || null,
    email: d.contactEmail || null,
  };
  if (d.newClient || !d.clientId) {
    const [c] = await db.insert(schema.clients).values(values).returning({ id: schema.clients.id });
    return c.id;
  }
  if (userCan) await db.update(schema.clients).set(values).where(eq(schema.clients.id, d.clientId));
  return d.clientId;
}

export async function saveContract(id: number | null, fd: FormData) {
  const user = await requirePerm("contrats", "write");
  const d = parseDraft(JSON.parse(String(fd.get("payload") || "{}")));
  if (!d.clientName.trim()) redirect(id ? `/contrats/${id}/modifier?e=client` : "/contrats/nouveau?e=client");
  const open = !id || (await db.select().from(schema.contracts).where(eq(schema.contracts.id, id)))[0]?.status;
  const editableClient = !id || open === "brouillon" || open === "envoye";
  const clientId = editableClient ? await writeClient(d, can(user, "clients", "write") || d.newClient || !d.clientId) : d.clientId;
  const fields = {
    clientId,
    projectId: d.projectId,
    quoteId: d.quoteId,
    templateName: d.templateName,
    title: d.title,
    subtitle: d.subtitle,
    preamble: d.preamble,
    startDate: d.startDate,
    endDate: d.endDate,
    durationValue: d.durationValue,
    durationUnit: d.durationUnit,
    signatureDate: d.signatureDate,
    signaturePlace: d.signaturePlace,
    amountMode: d.amountMode,
    monthlyAmount: d.monthlyAmount,
    totalAmount: d.totalAmount,
    taxMode: d.taxMode,
    paymentTerms: d.paymentTerms,
    paymentMethods: d.paymentMethods,
    includeSignature: d.includeSignature,
    clientName: d.clientName,
    clientAcronym: d.clientAcronym,
    clientType: d.clientType,
    clientAddress: d.clientAddress,
    clientNif: d.clientNif,
    repCivility: d.repCivility,
    repName: d.repName,
    repTitle: d.repTitle,
    contactName: d.contactName,
    contactRole: d.contactRole,
    contactPhone: d.contactPhone,
    contactEmail: d.contactEmail,
    services: d.services,
    definitions: d.definitions,
    sections: d.sections,
  };
  if (!id) {
    const number = await nextNumber("CTR", today());
    const [row] = await db.insert(schema.contracts).values({ ...fields, number, createdBy: user.id }).returning({ id: schema.contracts.id });
    revalidatePath("/contrats");
    redirect(`/contrats/${row.id}?ok=1`);
  }
  await db.update(schema.contracts).set(fields).where(eq(schema.contracts.id, id));
  revalidatePath(`/contrats/${id}`);
  redirect(`/contrats/${id}?ok=1`);
}

export async function deleteContract(id: number) {
  await requirePerm("contrats", "write");
  const [c] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, id));
  if (!c || c.status !== "brouillon") redirect(`/contrats/${id}?e=suppr`);
  await db.delete(schema.contracts).where(eq(schema.contracts.id, id));
  revalidatePath("/contrats");
  redirect("/contrats");
}

export async function setContractStatus(id: number, fd: FormData) {
  await requirePerm("contrats", "write");
  const status = String(fd.get("status") || "");
  const allowed = ["brouillon", "envoye", "signe", "en_cours", "termine", "resilie"];
  if (!allowed.includes(status)) redirect(`/contrats/${id}`);
  if (status === "resilie") {
    const terminationDate = String(fd.get("terminationDate") || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(terminationDate)) redirect(`/contrats/${id}?e=resil`);
    await db.update(schema.contracts).set({
      status,
      terminationDate,
      terminationReason: String(fd.get("terminationReason") || "").trim() || null,
    }).where(eq(schema.contracts.id, id));
  } else {
    await db.update(schema.contracts).set({ status }).where(eq(schema.contracts.id, id));
  }
  revalidatePath(`/contrats/${id}`);
  redirect(`/contrats/${id}?ok=statut`);
}

async function copyContract(id: number, renewal: boolean) {
  const user = await requirePerm("contrats", "write");
  const [c] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, id));
  if (!c) redirect("/contrats");
  const start = renewal && c.endDate ? nextDay(c.endDate) : null;
  let end: string | null = null;
  if (start && c.durationValue && (c.durationUnit === "months" || c.durationUnit === "days")) {
    const { addDuration } = await import("@/lib/contractModel");
    end = addDuration(start, c.durationValue, c.durationUnit);
  }
  const number = await nextNumber("CTR", today());
  const { id: _ignored, createdAt: _created, ...rest } = c;
  const [row] = await db.insert(schema.contracts).values({
    ...rest,
    number,
    status: "brouillon",
    startDate: start,
    endDate: end,
    signatureDate: null,
    terminationDate: null,
    terminationReason: null,
    createdBy: user.id,
  }).returning({ id: schema.contracts.id });
  redirect(`/contrats/${row.id}?ok=copie`);
}

export async function duplicateContract(id: number) {
  await copyContract(id, false);
}

export async function renewContract(id: number) {
  await copyContract(id, true);
}

export async function refreshClient(id: number) {
  await requirePerm("contrats", "write");
  const [c] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, id));
  if (!c?.clientId || (c.status !== "brouillon" && c.status !== "envoye")) redirect(`/contrats/${id}`);
  const snap = await clientSnapshot(c.clientId);
  if (!snap) redirect(`/contrats/${id}`);
  await db.update(schema.contracts).set(snap).where(eq(schema.contracts.id, id));
  revalidatePath(`/contrats/${id}`);
  redirect(`/contrats/${id}/modifier?ok=client`);
}

export async function saveAsTemplate(id: number, fd: FormData) {
  await requirePerm("contrats", "write");
  const [c] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, id));
  if (!c) redirect("/contrats");
  const name = String(fd.get("name") || "").trim() || `Modèle depuis ${c.number}`;
  await db.insert(schema.contractTemplates).values({
    name,
    description: "Enregistré depuis un contrat",
    title: c.title,
    subtitle: c.subtitle,
    preamble: c.preamble,
    amountMode: c.amountMode,
    durationUnit: c.durationUnit,
    durationValue: c.durationValue,
    sections: c.sections,
    services: c.services,
    definitions: c.definitions,
    builtin: false,
  });
  revalidatePath("/contrats/modeles");
  redirect(`/contrats/${id}?ok=modele`);
}

export async function saveTemplate(id: number | null, fd: FormData) {
  await requirePerm("contrats", "write");
  const d = parseDraft(JSON.parse(String(fd.get("payload") || "{}")));
  const name = String(fd.get("name") || d.templateName || "Modèle").trim();
  const values = {
    name,
    description: String(fd.get("description") || ""),
    title: d.title,
    subtitle: d.subtitle,
    preamble: d.preamble,
    amountMode: d.amountMode,
    durationUnit: d.durationUnit,
    durationValue: d.durationValue,
    sections: d.sections,
    services: d.services,
    definitions: d.definitions,
  };
  if (id) await db.update(schema.contractTemplates).set(values).where(eq(schema.contractTemplates.id, id));
  else await db.insert(schema.contractTemplates).values(values);
  revalidatePath("/contrats/modeles");
  redirect("/contrats/modeles?ok=1");
}

export async function deleteTemplate(id: number) {
  await requirePerm("contrats", "write");
  await db.delete(schema.contractTemplates).where(eq(schema.contractTemplates.id, id));
  revalidatePath("/contrats/modeles");
  redirect("/contrats/modeles");
}

export async function saveClause(id: number, fd: FormData) {
  await requirePerm("contrats", "write");
  const blocks = sourceToBlocks(String(fd.get("source") || ""));
  await db.update(schema.contractClauses).set({
    title: String(fd.get("title") || "").trim() || "Article",
    blocks,
  }).where(eq(schema.contractClauses.id, id));
  revalidatePath("/contrats/modeles");
  redirect("/contrats/modeles?ok=article");
}

export async function previewAllowed() {
  const u = await getUser();
  return !!u && can(u, "contrats", "write");
}
