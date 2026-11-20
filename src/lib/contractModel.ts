import { amountInWords, numberToWordsFr } from "./words";
import { CLIENT_TYPES } from "./format";

export type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "subs"; items: { text: string }[] }
  | { type: "table"; id: "services" | "definitions" | "prices" | "custom"; headers?: string[]; rows?: string[][] };

export type Section = { key: string; kind: "article" | "annex"; title: string; blocks: Block[] };
export type ServiceRow = { prestation: string; contenu: string; volume: string };
export type DefinitionRow = { term: string; definition: string };

export const CONTRACT_STATUS = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  signe: "Signé",
  en_cours: "En cours",
  termine: "Terminé",
  resilie: "Résilié",
} as const;

export type ContractStatus = keyof typeof CONTRACT_STATUS;

const BLANK = "______";

export function blankDate(iso: string | null | undefined, year = new Date().getFullYear()) {
  if (!iso) return `____ / ____ / ${year}`;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d} / ${m} / ${y}`;
}

export function addDuration(start: string, value: number, unit: "months" | "days") {
  const [y, m, d] = start.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (unit === "months") dt.setUTCMonth(dt.getUTCMonth() + value);
  else dt.setUTCDate(dt.getUTCDate() + value);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function nextDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

export function displayStatus(c: { status: string; startDate: string | null; endDate: string | null }, today = new Date().toISOString().slice(0, 10)): ContractStatus {
  const s = c.status as ContractStatus;
  if (s === "resilie" || s === "brouillon" || s === "envoye" || s === "termine") return s;
  if (c.endDate && c.endDate < today && (s === "signe" || s === "en_cours")) return "termine";
  if (c.startDate && c.startDate <= today && s === "signe") return "en_cours";
  return s === "en_cours" || s === "signe" ? s : "brouillon";
}

export function endingSoon(c: { status: string; endDate: string | null; startDate: string | null }, today = new Date().toISOString().slice(0, 10)) {
  const st = displayStatus(c, today);
  if (!c.endDate || st === "resilie" || st === "termine" || st === "brouillon") return false;
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 30);
  return c.endDate >= today && c.endDate <= limit.toISOString().slice(0, 10);
}

export type Party = {
  companyName: string; tagline: string; address: string; phone: string; email: string; website: string;
  footerNote: string; paymentMethods: string; paymentTerms: string;
  signatoryName: string; signatoryTitle: string; registrationNumber: string;
  logoPath?: string | null; signaturePath?: string | null;
};

export type ContractDoc = {
  number: string | null;
  title: string; subtitle: string; preamble: string;
  startDate: string | null; endDate: string | null; durationValue: number | null; durationUnit: string;
  signatureDate: string | null; signaturePlace: string;
  amountMode: string; monthlyAmount: number; totalAmount: number; taxMode: string;
  paymentTerms: string; paymentMethods: string; includeSignature: boolean;
  clientName: string; clientAcronym: string; clientType: string; clientAddress: string; clientNif: string;
  repCivility: string; repName: string; repTitle: string;
  contactName: string; contactRole: string; contactPhone: string; contactEmail: string;
  services: ServiceRow[]; definitions: DefinitionRow[]; sections: Section[];
};

function money(n: number) {
  return Math.round(n).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ") + " FDJ";
}

function dureePhrase(c: ContractDoc) {
  const fin = blankDate(c.endDate);
  if (c.durationUnit === "days" && c.durationValue) {
    const w = numberToWordsFr(c.durationValue);
    return `pour une durée ferme de ${w} (${c.durationValue}) jour${c.durationValue > 1 ? "s" : ""}, soit jusqu’au ${fin}`;
  }
  if (c.durationUnit === "months" && c.durationValue) {
    const w = numberToWordsFr(c.durationValue);
    return `pour une durée ferme de ${w} (${c.durationValue}) mois, soit jusqu’au ${fin}`;
  }
  return `et s’achèvent le ${fin}`;
}

function coverDuree(c: ContractDoc) {
  if (c.durationUnit === "days" && c.durationValue) return `${c.durationValue} jour${c.durationValue > 1 ? "s" : ""}`;
  if (c.durationUnit === "months" && c.durationValue) {
    const w = numberToWordsFr(c.durationValue);
    return `${w.charAt(0).toUpperCase()}${w.slice(1)} (${c.durationValue}) mois`;
  }
  if (c.startDate || c.endDate) return `Du ${blankDate(c.startDate)} au ${blankDate(c.endDate)}`;
  return BLANK;
}

function coverMontant(c: ContractDoc) {
  if (c.amountMode === "flat") return `Montant forfaitaire : ${money(c.totalAmount)}`;
  return `${money(c.monthlyAmount)} par mois — ${money(c.totalAmount)} au total`;
}

function mention(c: ContractDoc) {
  if (c.taxMode === "ht") return "hors taxes";
  if (c.taxMode === "ttc") return "toutes taxes comprises";
  return "______ (préciser : hors taxes / toutes taxes comprises)";
}

function formule(c: ContractDoc) {
  if (c.amountMode === "flat") return `un montant forfaitaire de ${amountInWords(c.totalAmount)} (${money(c.totalAmount)})`;
  return `un forfait mensuel de ${amountInWords(c.monthlyAmount)} (${money(c.monthlyAmount)})`;
}

export function tokenMap(c: ContractDoc, company: Party, numbers: Record<string, string>) {
  const sigle = c.clientAcronym || c.clientName;
  const nature = CLIENT_TYPES[c.clientType] || c.clientType || BLANK;
  const rep = [c.repCivility, c.repName].filter(Boolean).join(" ") || BLANK;
  const map: Record<string, string> = {
    "client.nom": c.clientName || BLANK,
    "client.sigle": sigle || BLANK,
    "client.forme": nature,
    "client.adresse": c.clientAddress || BLANK,
    "client.nif": c.clientNif || BLANK,
    representant: rep,
    "representant.civilite": c.repCivility || BLANK,
    "representant.nom": c.repName || BLANK,
    "representant.qualite": c.repTitle || BLANK,
    "referent.nom": c.contactName || BLANK,
    "referent.fonction": c.contactRole || BLANK,
    "referent.telephone": c.contactPhone || BLANK,
    "referent.email": c.contactEmail || BLANK,
    "prestataire.nom": company.companyName || BLANK,
    "prestataire.activite": company.tagline || BLANK,
    "prestataire.adresse": company.address || BLANK,
    "prestataire.telephone": company.phone || BLANK,
    "prestataire.email": company.email || BLANK,
    "prestataire.site": company.website || BLANK,
    "prestataire.nif": company.registrationNumber || BLANK,
    "prestataire.gerant": company.signatoryName || BLANK,
    "prestataire.qualite": company.signatoryTitle || BLANK,
    "prestataire.agrement": company.footerNote || BLANK,
    "montant.mensuel": money(c.monthlyAmount),
    "montant.mensuel.lettres": amountInWords(c.monthlyAmount),
    "montant.total": money(c.totalAmount),
    "montant.total.lettres": amountInWords(c.totalAmount),
    "montant.mention": mention(c),
    "montant.formule": formule(c),
    "duree.phrase": dureePhrase(c),
    "duree.recap": coverDuree(c),
    "montant.recap": coverMontant(c),
    "date.debut": blankDate(c.startDate),
    "date.fin": blankDate(c.endDate),
    "date.signature": blankDate(c.signatureDate),
    lieu: c.signaturePlace || "Djibouti",
    "paiement.modalites": c.paymentTerms || BLANK,
    "paiement.moyens": c.paymentMethods || BLANK,
    numero: c.number || "attribué à l’enregistrement",
  };
  for (const [k, n] of Object.entries(numbers)) map[`art.${k}`] = n;
  return map;
}

export function articleNumbers(sections: Section[]) {
  const map: Record<string, string> = {};
  let a = 0;
  let x = 0;
  for (const s of sections) {
    if (s.kind === "annex") map[s.key] = `Annexe ${++x}`;
    else map[s.key] = String(++a);
  }
  return map;
}

export function applyTokens(text: string, map: Record<string, string>) {
  const missing: string[] = [];
  const out = text.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_m, key: string) => {
    const k = key.toLowerCase().replace(/^art:/, "art.").replace(/^annexe:/, "art.");
    if (map[k] == null || map[k] === "") {
      missing.push(key);
      return BLANK;
    }
    return map[k];
  });
  return { text: out, missing };
}

export function collectMissing(c: ContractDoc, company: Party) {
  const numbers = articleNumbers(c.sections);
  const map = tokenMap(c, company, Object.fromEntries(Object.entries(numbers).map(([k, v]) => [k, v.replace("Annexe ", "")])));
  for (const s of c.sections) {
    const label = s.kind === "annex" ? numbers[s.key] : `article ${numbers[s.key]}`;
    map[`art.${s.key}`] = s.kind === "annex" ? numbers[s.key] : numbers[s.key];
    void label;
  }
  const missing = new Set<string>();
  const walk = (t: string) => applyTokens(t, map).missing.forEach((m) => missing.add(m));
  walk(c.title); walk(c.subtitle); walk(c.preamble);
  for (const s of c.sections) {
    walk(s.title);
    for (const b of s.blocks) {
      if (b.type === "p") walk(b.text);
      if (b.type === "ul") b.items.forEach(walk);
      if (b.type === "subs") b.items.forEach((i) => walk(i.text));
      if (b.type === "custom" as never) continue;
      if (b.type === "table" && b.rows) b.rows.flat().forEach(walk);
    }
  }
  return [...missing];
}

export function resolvedDoc(c: ContractDoc, company: Party): { doc: ContractDoc; missing: string[] } {
  const numbers = articleNumbers(c.sections);
  const map = tokenMap(c, company, {});
  for (const [k, v] of Object.entries(numbers)) map[`art.${k}`] = v.replace(/^Annexe /, "");
  const missing = new Set<string>();
  const r = (t: string) => {
    const x = applyTokens(t, map);
    x.missing.forEach((m) => missing.add(m));
    return x.text;
  };
  const sections = c.sections.map((s) => ({
    ...s,
    title: r(s.title),
    blocks: s.blocks.map((b) => {
      if (b.type === "p") return { ...b, text: r(b.text) };
      if (b.type === "ul") return { ...b, items: b.items.map(r) };
      if (b.type === "subs") return { ...b, items: b.items.map((i) => ({ text: r(i.text) })) };
      if (b.type === "table" && b.id === "custom") return { ...b, headers: b.headers?.map(r), rows: b.rows?.map((row) => row.map(r)) };
      return b;
    }),
  }));
  return {
    doc: { ...c, title: r(c.title), subtitle: r(c.subtitle), preamble: r(c.preamble), sections },
    missing: [...missing],
  };
}

export function priceRows(c: ContractDoc): string[][] {
  if (c.amountMode === "flat") return [["Montant forfaitaire", money(c.totalAmount)], ["MONTANT TOTAL DU CONTRAT", money(c.totalAmount)]];
  return [
    ["Forfait mensuel", money(c.monthlyAmount)],
    ["Nombre de mois", String(c.durationValue || BLANK)],
    ["MONTANT TOTAL DU CONTRAT", money(c.totalAmount)],
  ];
}

export { money, coverDuree, coverMontant, mention };
