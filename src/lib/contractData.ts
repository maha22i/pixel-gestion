import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CLAUSES, TEMPLATE_SEEDS, sectionsFrom } from "./contractLibrary";
import { addDuration, type ContractDoc, type DefinitionRow, type Section, type ServiceRow } from "./contractModel";

export async function ensureContractSeeds() {
  const existing = await db.select({ id: schema.contractClauses.id }).from(schema.contractClauses).limit(1);
  if (existing.length === 0) {
    await db.insert(schema.contractClauses).values(CLAUSES.map((c) => ({ key: c.key, kind: c.kind, title: c.title, blocks: c.blocks })));
  }
  const templates = await db.select({ id: schema.contractTemplates.id }).from(schema.contractTemplates).limit(1);
  if (templates.length === 0) {
    await db.insert(schema.contractTemplates).values(TEMPLATE_SEEDS.map((t) => ({
      name: t.name,
      description: t.description,
      title: t.title,
      subtitle: t.subtitle,
      preamble: t.preamble,
      amountMode: t.amountMode,
      durationUnit: t.durationUnit,
      durationValue: t.durationValue,
      sections: sectionsFrom(t.keys),
      services: t.services,
      definitions: t.definitions,
      builtin: true,
    })));
  }
}

export function asSections(v: unknown): Section[] {
  return Array.isArray(v) ? v as Section[] : [];
}
export function asServices(v: unknown): ServiceRow[] {
  return Array.isArray(v) ? v as ServiceRow[] : [];
}
export function asDefs(v: unknown): DefinitionRow[] {
  return Array.isArray(v) ? v as DefinitionRow[] : [];
}

export function toDoc(row: typeof schema.contracts.$inferSelect): ContractDoc {
  return {
    number: row.number,
    title: row.title,
    subtitle: row.subtitle,
    preamble: row.preamble,
    startDate: row.startDate,
    endDate: row.endDate,
    durationValue: row.durationValue,
    durationUnit: row.durationUnit,
    signatureDate: row.signatureDate,
    signaturePlace: row.signaturePlace,
    amountMode: row.amountMode,
    monthlyAmount: row.monthlyAmount,
    totalAmount: row.totalAmount,
    taxMode: row.taxMode,
    paymentTerms: row.paymentTerms,
    paymentMethods: row.paymentMethods,
    includeSignature: row.includeSignature,
    clientName: row.clientName,
    clientAcronym: row.clientAcronym,
    clientType: row.clientType,
    clientAddress: row.clientAddress,
    clientNif: row.clientNif,
    repCivility: row.repCivility,
    repName: row.repName,
    repTitle: row.repTitle,
    contactName: row.contactName,
    contactRole: row.contactRole,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    services: asServices(row.services),
    definitions: asDefs(row.definitions),
    sections: asSections(row.sections),
  };
}

export type Draft = ContractDoc & {
  clientId: number | null;
  projectId: number | null;
  quoteId: number | null;
  templateName: string | null;
  newClient: boolean;
};

function num(v: unknown) {
  const n = Number(String(v ?? "").replace(/\s/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function str(v: unknown) { return String(v ?? ""); }
function dateOrNull(v: unknown) {
  const s = str(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function parseDraft(raw: unknown): Draft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const durationUnit = ["months", "days", "end"].includes(str(o.durationUnit)) ? str(o.durationUnit) : "months";
  const amountMode = str(o.amountMode) === "flat" ? "flat" : "monthly";
  const startDate = dateOrNull(o.startDate);
  const durationValue = str(o.durationValue) === "" ? null : num(o.durationValue) || null;
  let endDate = dateOrNull(o.endDate);
  if (startDate && durationValue && (durationUnit === "months" || durationUnit === "days")) {
    endDate = addDuration(startDate, durationValue, durationUnit);
  }
  const monthlyAmount = num(o.monthlyAmount);
  const totalAmount = amountMode === "monthly" && durationUnit === "months" && durationValue
    ? monthlyAmount * durationValue
    : num(o.totalAmount);
  return {
    number: null,
    clientId: num(o.clientId) || null,
    projectId: num(o.projectId) || null,
    quoteId: num(o.quoteId) || null,
    templateName: str(o.templateName) || null,
    newClient: o.newClient === true,
    title: str(o.title),
    subtitle: str(o.subtitle),
    preamble: str(o.preamble),
    startDate,
    endDate,
    durationValue,
    durationUnit,
    signatureDate: dateOrNull(o.signatureDate),
    signaturePlace: str(o.signaturePlace) || "Djibouti",
    amountMode,
    monthlyAmount,
    totalAmount,
    taxMode: ["ht", "ttc", "unspecified"].includes(str(o.taxMode)) ? str(o.taxMode) : "unspecified",
    paymentTerms: str(o.paymentTerms),
    paymentMethods: str(o.paymentMethods),
    includeSignature: o.includeSignature !== false,
    clientName: str(o.clientName),
    clientAcronym: str(o.clientAcronym),
    clientType: str(o.clientType),
    clientAddress: str(o.clientAddress),
    clientNif: str(o.clientNif),
    repCivility: str(o.repCivility),
    repName: str(o.repName),
    repTitle: str(o.repTitle),
    contactName: str(o.contactName),
    contactRole: str(o.contactRole),
    contactPhone: str(o.contactPhone),
    contactEmail: str(o.contactEmail),
    services: asServices(o.services).map((s) => ({ prestation: str(s.prestation), contenu: str(s.contenu), volume: str(s.volume) })),
    definitions: asDefs(o.definitions).map((d) => ({ term: str(d.term), definition: str(d.definition) })),
    sections: asSections(o.sections),
  };
}

export async function loadClauses() {
  await ensureContractSeeds();
  return db.select().from(schema.contractClauses).orderBy(asc(schema.contractClauses.id));
}

export async function loadTemplates() {
  await ensureContractSeeds();
  return db.select().from(schema.contractTemplates).orderBy(asc(schema.contractTemplates.id));
}

export async function clientSnapshot(id: number) {
  const [c] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
  if (!c) return null;
  return {
    clientId: c.id,
    clientName: c.name,
    clientAcronym: c.acronym ?? "",
    clientType: c.type,
    clientAddress: c.address ?? "",
    clientNif: c.nif ?? "",
    repCivility: c.repCivility ?? "",
    repName: c.repName ?? "",
    repTitle: c.repTitle ?? "",
    contactName: c.contactName ?? "",
    contactRole: c.contactRole ?? "",
    contactPhone: c.phone ?? "",
    contactEmail: c.email ?? "",
  };
}
