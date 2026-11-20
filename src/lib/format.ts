export function fdj(n: number | null | undefined) {
  const v = Math.round(Number(n ?? 0));
  return v.toLocaleString("fr-FR").replace(/[  ]/g, " ") + " FDJ";
}

export function num(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return (Number.isInteger(v) ? v : Math.round(v * 100) / 100).toLocaleString("fr-FR").replace(/[  ]/g, " ");
}

export function dateFr(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const CLIENT_TYPES: Record<string, string> = {
  particulier: "Particulier",
  entreprise: "Société",
  restaurant: "Restaurant / commerce",
  hotel: "Hôtel",
  association: "Association",
  etablissement_public: "Établissement public",
  institution: "Institution",
};

export const PROJECT_TYPES: Record<string, string> = {
  mariage: "Mariage",
  prive: "Entreprise privée",
  public: "Public / institutionnel",
  autonome: "Autonome (interne)",
};

export const PROJECT_STATUS: Record<string, string> = {
  prospect: "Prospect",
  confirme: "Confirmé",
  en_cours: "En cours",
  livre: "Livré",
  cloture: "Clôturé",
  publie: "Publié",
  annule: "Annulé",
};

export const INTERNAL_STATUS: Record<string, string> = {
  en_cours: "En cours",
  publie: "Publié",
  annule: "Annulé",
};

export const PROJECT_NATURE: Record<string, string> = {
  client: "Projet client",
  interne: "Projet interne",
};

export const PRIORITY: Record<string, string> = {
  basse: "Basse",
  normale: "Normale",
  haute: "Haute",
  urgente: "Urgente",
};

export const TASK_STATUS: Record<string, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  en_revue: "En revue",
  termine: "Terminé",
  bloque: "Bloqué",
  annule: "Annulé",
};

export type TaskSignal = {
  key: "late" | "doing" | "done" | "review" | "blocked" | "todo" | "cancelled";
  label: string;
  badge: string;
  bar: string;
  row: string;
  wash: string;
  date: string;
  late: boolean;
};

function dueIso(due: string | Date | null | undefined) {
  if (!due) return null;
  if (typeof due === "string") return due.slice(0, 10);
  return due.toISOString().slice(0, 10);
}

export function taskSignal(status: string, due: string | Date | null | undefined, day: string): TaskSignal {
  const iso = dueIso(due);
  const open = status !== "termine" && status !== "annule";
  const late = open && !!iso && iso < day;
  if (status === "termine") {
    return { key: "done", label: "Terminé", badge: "badge-green", bar: "bg-emerald-500", row: "task-done", wash: "bg-[#f3faf6]", date: "text-navy-600/70", late: false };
  }
  if (status === "annule") {
    return { key: "cancelled", label: "Annulé", badge: "badge-gray", bar: "bg-navy-200", row: "", wash: "", date: "text-navy-600/70", late: false };
  }
  if (late) {
    return { key: "late", label: "En retard", badge: "badge-red", bar: "bg-red-500", row: "task-late", wash: "bg-[#fff6f6]", date: "font-bold text-red-700", late: true };
  }
  if (status === "en_cours") {
    return { key: "doing", label: "En cours", badge: "badge-blue", bar: "bg-sky-600", row: "task-doing", wash: "bg-[#f3f9fd]", date: "text-navy-600/70", late: false };
  }
  if (status === "en_revue") {
    return { key: "review", label: "En revue", badge: "badge-gold", bar: "bg-gold", row: "", wash: "", date: "text-navy-600/70", late: false };
  }
  if (status === "bloque") {
    return { key: "blocked", label: "Bloqué", badge: "badge-gold", bar: "bg-amber-600", row: "", wash: "", date: "text-navy-600/70", late: false };
  }
  return { key: "todo", label: TASK_STATUS[status] ?? status, badge: "badge-gray", bar: "bg-navy-200", row: "", wash: "", date: "text-navy-600/70", late: false };
}

export const QUOTE_STATUS: Record<string, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
};

export const PAYMENT_STATUS: Record<string, string> = {
  non_payee: "Non payée",
  acompte: "Acompte versé",
  partielle: "Partiellement payée",
  soldee: "Soldée",
  annulee: "Annulée",
};

export const PAYMENT_METHODS: Record<string, string> = {
  waafi: "WAAFI",
  cacpay: "CACPAY",
  dmoney: "D-Money",
  virement: "Virement bancaire",
  especes: "Espèces",
};

export const EXPENSE_CATEGORIES: Record<string, string> = {
  salaires: "Salaires",
  materiel: "Matériel",
  carburant: "Carburant / transport",
  location: "Location",
  sous_traitance: "Sous-traitance",
  communication: "Communication / pub",
  loyer: "Loyer & charges",
  autre: "Autre",
};

export const ITEM_KINDS: Record<string, string> = { service: "Service", produit: "Produit" };
