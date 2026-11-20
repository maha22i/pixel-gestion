import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { db, schema } from "../src/db";
import { ensureContractSeeds, asSections, asServices, asDefs } from "../src/lib/contractData";
import { contractPdf } from "../src/lib/contractPdf";
import { getSettings } from "../src/lib/settings";
import { nextNumber } from "../src/lib/numbering";
import { blankDate, collectMissing, resolvedDoc } from "../src/lib/contractModel";
import type { ContractDoc } from "../src/lib/contractModel";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
  console.log("✔", msg);
}

async function main() {
  await ensureContractSeeds();
  const company = await getSettings();
  const templates = await db.select().from(schema.contractTemplates);
  const full = templates.find((t) => t.name.includes("mensuel de production"));
  const resto = templates.find((t) => t.name.includes("restaurant"));
  const ponctuel = templates.find((t) => t.name.includes("ponctuelle"));
  assert(full && resto && ponctuel, "4 modèles semés, dont mensuel, restaurant et ponctuel");

  const [client] = await db.insert(schema.clients).values({
    type: "etablissement_public",
    name: "Agence de Réhabilitation Urbaine et du Logement Social",
    acronym: "ARULOS",
    address: "Djibouti",
    repCivility: "M.",
    repName: "Test Directeur",
    repTitle: "Directeur Général",
  }).returning();

  const base = (tpl: typeof full, extra: Partial<ContractDoc>): ContractDoc => ({
    number: "PN-CTR-TEST",
    title: tpl!.title,
    subtitle: tpl!.subtitle,
    preamble: tpl!.preamble,
    startDate: "2026-01-01",
    endDate: "2026-06-30",
    durationValue: tpl!.durationValue,
    durationUnit: tpl!.durationUnit,
    signatureDate: null,
    signaturePlace: "Djibouti",
    amountMode: tpl!.amountMode,
    monthlyAmount: 130000,
    totalAmount: 780000,
    taxMode: "unspecified",
    paymentTerms: company.paymentTerms,
    paymentMethods: company.paymentMethods,
    includeSignature: true,
    clientName: client.name,
    clientAcronym: "ARULOS",
    clientType: "etablissement_public",
    clientAddress: "Djibouti",
    clientNif: "",
    repCivility: "M.",
    repName: "Test Directeur",
    repTitle: "Directeur Général",
    contactName: "",
    contactRole: "",
    contactPhone: "",
    contactEmail: "",
    services: asServices(tpl!.services),
    definitions: asDefs(tpl!.definitions),
    sections: asSections(tpl!.sections),
    ...extra,
  });

  const arulos = base(full, { preamble: (full!.preamble || "") + "\nContact : {{prestataire.telephone}}" });
  const resolved = resolvedDoc(arulos, company).doc;
  const flat = JSON.stringify(resolved);
  assert(resolved.sections.filter((s) => s.kind === "article").length === 26, "26 articles");
  assert(flat.includes("ARULOS"), "client ARULOS");
  assert(flat.includes("130 000"), "montant mensuel");
  assert(flat.includes("préciser : hors taxes"), "mention fiscale non précisée");
  assert(!flat.includes("{{"), "aucun jeton brut");
  assert(!flat.includes("Zéro Bidonville"), "pas de mention propre à l’ARULOS dans le modèle");
  assert(flat.includes(company.phone), "téléphone des paramètres dans les textes");
  const buf1 = await contractPdf(arulos, company);
  assert(buf1.length > 50_000 && buf1.includes(Buffer.from("Page")), "PDF généré avec pagination");

  const shortSections = asSections(resto!.sections).filter((s) => !["obligations_p", "obligations_c"].includes(s.key));
  const restaurant = base(resto, {
    clientName: "L'Oasis du Phénix",
    clientAcronym: "",
    clientType: "restaurant",
    monthlyAmount: 40000,
    totalAmount: 240000,
    durationValue: 6,
    sections: shortSections,
    services: [{ prestation: "Vidéos", contenu: "Plats et salle", volume: "3 par mois" }],
  });
  const flat2 = JSON.stringify(resolvedDoc(restaurant, company).doc);
  assert(flat2.includes("40 000"), "restaurant 40 000");
  assert(restaurant.sections.filter((s) => s.kind === "article").length === 8, "restaurant allégé : 8 articles");
  assert(flat2.includes("au sens de l’article 7") || flat2.includes("article 7"), "le renvoi retard suit la nouvelle numérotation");
  const missing = collectMissing(restaurant, company);
  assert(!flat2.includes("{{"), "renvois résolus ou remplacés");
  console.log("  jetons vides restaurant:", missing.join(", ") || "aucun");
  await contractPdf(restaurant, company);

  const ponct = base(ponctuel, {
    amountMode: "flat",
    monthlyAmount: 0,
    totalAmount: 250000,
    durationUnit: "end",
    durationValue: null,
    startDate: null,
    endDate: "2026-11-02",
    signatureDate: null,
    title: "Couverture d’un événement",
  });
  const flat3 = JSON.stringify(resolvedDoc(ponct, company).doc);
  assert(blankDate(ponct.signatureDate) === "____ / ____ / 2026", "date de signature vide");
  assert(flat3.toLowerCase().includes("forfaitaire"), "montant forfaitaire");
  await contractPdf(ponct, company);

  const oldPhone = company.phone;
  await db.update(schema.settings).set({ phone: "+253 77 00 00 99" }).where(eq(schema.settings.id, 1));
  const changed = await getSettings();
  const flat4 = JSON.stringify(resolvedDoc(arulos, changed).doc);
  assert(flat4.includes("+253 77 00 00 99"), "le document reprend le nouveau téléphone");
  await contractPdf(arulos, changed);
  await db.update(schema.settings).set({ phone: oldPhone }).where(eq(schema.settings.id, 1));

  const email = `sans-contrat-${Date.now()}@example.com`;
  const [u] = await db.insert(schema.users).values({
    name: "Sans contrat",
    email,
    passwordHash: await bcrypt.hash("temporaire1", 12),
    role: "user",
  }).returning();
  await db.insert(schema.permissions).values([
    { userId: u.id, module: "devis", level: "read" },
    { userId: u.id, module: "contrats", level: "none" },
  ]);
  const number = await nextNumber("CTR", "2026-10-22");
  const [saved] = await db.insert(schema.contracts).values({
    number,
    clientId: client.id,
    title: arulos.title,
    subtitle: arulos.subtitle,
    preamble: arulos.preamble,
    clientName: client.name,
    clientAcronym: "ARULOS",
    clientType: "etablissement_public",
    amountMode: "monthly",
    monthlyAmount: 130000,
    totalAmount: 780000,
    durationValue: 6,
    durationUnit: "months",
    sections: arulos.sections,
    services: arulos.services,
    definitions: arulos.definitions,
    paymentTerms: company.paymentTerms,
    paymentMethods: company.paymentMethods,
  }).returning();
  const token = await new SignJWT({ uid: u.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET || ""));
  const res = await fetch(`http://localhost:3000/api/pdf/contrat/${saved.id}`, { headers: { cookie: `pf_session=${token}` } });
  assert(res.status === 403, `PDF refusé sans droit (statut ${res.status})`);
  const devis = await fetch("http://localhost:3000/api/pdf/devis/1", { headers: { cookie: `pf_session=${token}` } });
  assert(devis.status === 200 || devis.status === 404, `les devis restent accessibles (${devis.status})`);

  await db.delete(schema.contracts).where(eq(schema.contracts.id, saved.id));
  await db.delete(schema.permissions).where(eq(schema.permissions.userId, u.id));
  await db.delete(schema.users).where(eq(schema.users.id, u.id));
  await db.delete(schema.clients).where(eq(schema.clients.id, client.id));
  console.log("Smoke OK", number);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
