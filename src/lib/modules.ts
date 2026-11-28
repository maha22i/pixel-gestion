export const MODULE_GROUPS = [
  {
    label: "Pilotage",
    keys: ["tableau_de_bord", "projets", "taches", "planning", "suivi_equipe", "presences", "rh", "materiel"] as const,
  },
  {
    label: "Commercial",
    keys: ["clients", "catalogue", "devis", "contrats"] as const,
  },
  {
    label: "Finance",
    keys: ["factures", "paiements", "depenses"] as const,
  },
  {
    label: "Outils",
    keys: ["aicha"] as const,
  },
] as const;

export const MODULES = [
  { key: "tableau_de_bord", label: "Tableau de bord financier" },
  { key: "projets", label: "Projets" },
  { key: "taches", label: "Tâches" },
  { key: "planning", label: "Planning" },
  { key: "suivi_equipe", label: "Suivi de l'équipe" },
  { key: "presences", label: "Présences" },
  { key: "rh", label: "Ressources humaines" },
  { key: "materiel", label: "Matériel" },
  { key: "clients", label: "Clients" },
  { key: "catalogue", label: "Catalogue" },
  { key: "devis", label: "Devis" },
  { key: "contrats", label: "Contrats" },
  { key: "factures", label: "Factures" },
  { key: "paiements", label: "Paiements" },
  { key: "depenses", label: "Dépenses" },
  { key: "aicha", label: "Aicha (assistante IA)" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export type Level = "none" | "own" | "read" | "write";
export type AppRole = "admin" | "manager" | "technician";

export const ROLES: { key: AppRole; label: string; hint: string }[] = [
  { key: "admin", label: "Administrateur", hint: "Accès total, y compris utilisateurs et paramètres" },
  { key: "manager", label: "Manager", hint: "Pilote l'équipe. Commercial en écriture, finance en lecture" },
  { key: "technician", label: "Technicien", hint: "Ses tâches, planning en lecture, projets, catalogue et matériel en lecture" },
];

export const LEVEL_LABELS: Record<Level, string> = {
  none: "Aucun accès",
  own: "Ses tâches uniquement",
  read: "Lecture",
  write: "Lecture + écriture",
};

export const TASK_LEVELS: Level[] = ["none", "own", "read", "write"];

/** Niveaux proposés pour chaque module (« les siens » seulement pour tâches et présences ; Aicha : accès ou non). */
export function moduleLevels(key: ModuleKey): Level[] {
  if (key === "taches" || key === "presences") return ["none", "own", "read", "write"];
  if (key === "aicha") return ["none", "read"];
  return ["none", "read", "write"];
}

/** Libellé court d'un niveau dans un module donné (pour les boutons). */
export function levelShort(key: ModuleKey, level: Level) {
  if (key === "aicha") return level === "none" ? "Aucun" : "Accès";
  if (key === "rh") return { none: "Aucun", own: "Les siens", read: "Voir", write: "Valider" }[level];
  return { none: "Aucun", own: "Les siens", read: "Lecture", write: "Écriture" }[level];
}
export const STANDARD_LEVELS: Level[] = ["none", "read", "write"];

const ALL_WRITE = Object.fromEntries(MODULES.map((m) => [m.key, "write"])) as Record<ModuleKey, Level>;
const NONE = Object.fromEntries(MODULES.map((m) => [m.key, "none"])) as Record<ModuleKey, Level>;

export const ROLE_DEFAULTS: Record<AppRole, Record<ModuleKey, Level>> = {
  admin: ALL_WRITE,
  manager: {
    ...NONE,
    tableau_de_bord: "write",
    projets: "write",
    taches: "write",
    planning: "write",
    suivi_equipe: "write",
    presences: "write",
    clients: "write",
    catalogue: "write",
    devis: "write",
    contrats: "write",
    factures: "read",
    paiements: "read",
    depenses: "read",
    materiel: "write",
    rh: "write",
    aicha: "read",
  },
  technician: {
    ...NONE,
    taches: "own",
    presences: "own",
    planning: "read",
    projets: "read",
    catalogue: "read",
    materiel: "read",
  },
};

export function normalizeRole(role: string | null | undefined): AppRole {
  if (role === "admin" || role === "manager") return role;
  return "technician";
}

export function roleLabel(role: string | null | undefined) {
  return ROLES.find((r) => r.key === normalizeRole(role))?.label ?? "Technicien";
}

export function levelLabel(module: ModuleKey, level: Level) {
  if (level === "own" && module === "presences") return "Ses pointages uniquement";
  if (module === "aicha") return level === "none" ? "Aucun accès" : "Peut utiliser Aicha";
  if (module === "rh") return level === "write" ? "Voit et valide les demandes" : level === "read" ? "Voit les demandes" : "Aucun accès";
  return LEVEL_LABELS[level];
}
