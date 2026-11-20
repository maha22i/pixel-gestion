import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { asDefs, asSections, asServices, ensureContractSeeds, loadClauses, loadTemplates } from "@/lib/contractData";
import type { EditorState } from "./ContractEditor";

export async function editorContext() {
  await ensureContractSeeds();
  const [clients, projects, quotes, catalog, clauses, templates, settings] = await Promise.all([
    db.select().from(schema.clients).orderBy(asc(schema.clients.name)),
    db.select({ id: schema.projects.id, title: schema.projects.title, clientId: schema.projects.clientId }).from(schema.projects).orderBy(asc(schema.projects.title)),
    db.select({ id: schema.quotes.id, number: schema.quotes.number, clientId: schema.quotes.clientId, projectId: schema.quotes.projectId, total: schema.quotes.total, subject: schema.quotes.subject, status: schema.quotes.status }).from(schema.quotes).orderBy(asc(schema.quotes.number)),
    db.select({ id: schema.catalogItems.id, name: schema.catalogItems.name, description: schema.catalogItems.description }).from(schema.catalogItems).where(eq(schema.catalogItems.active, true)),
    loadClauses(),
    loadTemplates(),
    getSettings(),
  ]);
  return { clients, projects, quotes, catalog, clauses, templates, settings };
}

export function emptyState(settings: { paymentTerms: string; paymentMethods: string }): EditorState {
  return {
    clientId: "", projectId: "", quoteId: "", templateName: "", newClient: false,
    title: "", subtitle: "", preamble: "",
    startDate: "", endDate: "", durationValue: "", durationUnit: "months", signatureDate: "", signaturePlace: "Djibouti",
    amountMode: "monthly", monthlyAmount: "", totalAmount: "", taxMode: "unspecified",
    paymentTerms: settings.paymentTerms, paymentMethods: settings.paymentMethods, includeSignature: true,
    clientName: "", clientAcronym: "", clientType: "entreprise", clientAddress: "", clientNif: "",
    repCivility: "", repName: "", repTitle: "",
    contactName: "", contactRole: "", contactPhone: "", contactEmail: "",
    services: [], definitions: [], sections: [],
  };
}

export function stateFromRow(row: typeof schema.contracts.$inferSelect): EditorState {
  return {
    clientId: row.clientId ? String(row.clientId) : "",
    projectId: row.projectId ? String(row.projectId) : "",
    quoteId: row.quoteId ? String(row.quoteId) : "",
    templateName: row.templateName ?? "",
    newClient: false,
    title: row.title, subtitle: row.subtitle, preamble: row.preamble,
    startDate: row.startDate ?? "", endDate: row.endDate ?? "",
    durationValue: row.durationValue ? String(row.durationValue) : "",
    durationUnit: row.durationUnit, signatureDate: row.signatureDate ?? "", signaturePlace: row.signaturePlace,
    amountMode: row.amountMode, monthlyAmount: String(row.monthlyAmount || ""), totalAmount: String(row.totalAmount || ""),
    taxMode: row.taxMode, paymentTerms: row.paymentTerms, paymentMethods: row.paymentMethods, includeSignature: row.includeSignature,
    clientName: row.clientName, clientAcronym: row.clientAcronym, clientType: row.clientType || "entreprise",
    clientAddress: row.clientAddress, clientNif: row.clientNif,
    repCivility: row.repCivility, repName: row.repName, repTitle: row.repTitle,
    contactName: row.contactName, contactRole: row.contactRole, contactPhone: row.contactPhone, contactEmail: row.contactEmail,
    services: asServices(row.services), definitions: asDefs(row.definitions), sections: asSections(row.sections),
  };
}
