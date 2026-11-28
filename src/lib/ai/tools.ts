import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, type SessionUser } from "@/lib/auth";
import { docTotals, lineTotal } from "@/lib/calc";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, PRIORITY, PROJECT_STATUS, QUOTE_STATUS, TASK_STATUS, addDays, today } from "@/lib/format";
import { invoicesFinance } from "@/lib/finance";
import { nextNumber } from "@/lib/numbering";
import { getSettings } from "@/lib/settings";
import { logTask, notify, setAssignees, taskScope } from "@/lib/tasks";
import { todayLive } from "@/lib/attendance/live";
import { CONTRACT_TYPE, LEAVE_KIND, LEAVE_STATUS, canSeeLeave, canSeePayroll, leaveBalances, managersAndAdmins, workingDays } from "@/lib/rh";
import { clientSnapshot, loadTemplates } from "@/lib/contractData";
import { addDuration } from "@/lib/contractModel";

type Json = Record<string, unknown>;
type Tool = {
  name: string;
  label: string; // affiché pendant l'exécution
  description: string;
  parameters: Json;
  write?: boolean;
  allowed: (u: SessionUser) => boolean;
  run: (u: SessionUser, a: Json) => Promise<unknown>;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const date = (v: unknown, fallback = "") => (DATE.test(str(v)) ? str(v) : fallback);
const like = (q: unknown) => `%${str(q)}%`;
const rows = async <T = Json>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
const obj = (properties: Json, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const S = (description: string, extra: Json = {}) => ({ type: "string", description, ...extra });
const N = (description: string) => ({ type: "number", description });
const I = (description: string) => ({ type: "integer", description });
const denied = () => ({ erreur: "Accès refusé : cet utilisateur n'a pas les droits sur cette partie de l'application." });

/** Projets visibles par l'utilisateur (tous pour l'admin, sinon ceux dont il est responsable ou membre). */
const projectScope = (u: SessionUser) => (u.role === "admin" ? sql`TRUE` : sql`(p.owner_id = ${u.id} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${u.id}))`);

export const TOOLS: Tool[] = [
  /* ───────────── Lecture ───────────── */
  {
    name: "resume_entreprise",
    label: "Je regarde le tableau de bord",
    description: "Vue d'ensemble : chiffre d'affaires et encaissements du mois, impayés, devis en attente, projets en cours, tâches en retard, présence du jour.",
    parameters: obj({}),
    allowed: () => true,
    run: async (u) => {
      const t = today();
      const month = t.slice(0, 7);
      const out: Json = { date: t };
      if (can(u, "tableau_de_bord") || can(u, "factures")) {
        const inv = (await invoicesFinance()).filter((i) => i.status !== "annulee");
        const [pay] = await rows<{ s: number }>(sql`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM payments WHERE to_char(date,'YYYY-MM') = ${month}`);
        const [exp] = await rows<{ s: number }>(sql`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM expenses WHERE to_char(date,'YYYY-MM') = ${month}`);
        out.finances = {
          facture_ce_mois_fdj: inv.filter((i) => i.issueDate.startsWith(month)).reduce((s, i) => s + i.total, 0),
          encaisse_ce_mois_fdj: Number(pay.s),
          depenses_ce_mois_fdj: Number(exp.s),
          reste_a_encaisser_fdj: inv.reduce((s, i) => s + i.remaining, 0),
          factures_en_retard: inv.filter((i) => i.overdue).length,
        };
      }
      if (can(u, "devis")) out.devis_en_attente = (await rows(sql`SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::bigint AS total_fdj FROM quotes WHERE status IN ('brouillon','envoye')`))[0];
      if (can(u, "projets")) out.projets = await rows(sql`SELECT status, COUNT(*)::int AS n FROM projects p WHERE ${projectScope(u)} GROUP BY status`);
      if (can(u, "taches")) {
        const own = taskScope(u) === "own";
        out.taches = (await rows(sql`SELECT
          COUNT(*) FILTER (WHERE t.status NOT IN ('termine','annule'))::int AS ouvertes,
          COUNT(*) FILTER (WHERE t.due_date < ${t}::date AND t.status NOT IN ('termine','annule'))::int AS en_retard,
          COUNT(*) FILTER (WHERE t.status = 'en_revue')::int AS a_valider
          FROM tasks t WHERE ${own ? sql`EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ${u.id})` : sql`TRUE`}`))[0];
      }
      if (can(u, "presences", "write")) {
        const live = await todayLive();
        out.presence_aujourdhui = { presents: live.stats.present, effectif: live.stats.total, retards: live.stats.late, absents: live.stats.absent + live.stats.notYet };
      }
      return out;
    },
  },
  {
    name: "chercher_clients",
    label: "Je cherche dans les clients",
    description: "Recherche des clients par nom, sigle, téléphone ou e-mail. Sans texte : les clients les plus récents.",
    parameters: obj({ texte: S("Texte recherché (facultatif)") }),
    allowed: (u) => can(u, "clients"),
    run: async (_u, a) => rows(sql`
      SELECT id, name AS nom, type, acronym AS sigle, phone AS telephone, email, address AS adresse, nif,
        (SELECT COUNT(*)::int FROM projects p WHERE p.client_id = c.id) AS projets,
        '/clients/' || id AS lien
      FROM clients c
      WHERE ${str(a.texte)} = '' OR name ILIKE ${like(a.texte)} OR COALESCE(acronym,'') ILIKE ${like(a.texte)} OR COALESCE(phone,'') ILIKE ${like(a.texte)} OR COALESCE(email,'') ILIKE ${like(a.texte)}
      ORDER BY created_at DESC LIMIT 25`),
  },
  {
    name: "fiche_client",
    label: "J'ouvre la fiche du client",
    description: "Détail d'un client : coordonnées, projets, devis, factures et reste à payer.",
    parameters: obj({ client_id: I("Identifiant du client") }, ["client_id"]),
    allowed: (u) => can(u, "clients"),
    run: async (u, a) => {
      const id = num(a.client_id);
      const [c] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
      if (!c) return { erreur: "Client introuvable." };
      const out: Json = { client: { ...c, lien: `/clients/${id}` } };
      out.projets = await rows(sql`SELECT id, title AS titre, status AS statut, end_date AS echeance, '/projets/' || id AS lien FROM projects p WHERE client_id = ${id} AND ${projectScope(u)}`);
      if (can(u, "devis")) out.devis = await rows(sql`SELECT id, number AS numero, subject AS objet, status AS statut, total AS total_fdj, issue_date AS date, '/devis/' || id AS lien FROM quotes WHERE client_id = ${id} ORDER BY issue_date DESC LIMIT 10`);
      if (can(u, "factures")) out.factures = (await invoicesFinance(sql`i.client_id = ${id}`)).slice(0, 10).map((i) => ({ id: i.id, numero: i.number, total_fdj: i.total, reste_fdj: i.remaining, en_retard: i.overdue, lien: `/factures/${i.id}` }));
      return out;
    },
  },
  {
    name: "lister_projets",
    label: "Je consulte les projets",
    description: `Liste des projets avec client, responsable, échéance et avancement des tâches. Statuts : ${Object.keys(PROJECT_STATUS).join(", ")}.`,
    parameters: obj({ statut: S("Filtrer par statut (facultatif)"), texte: S("Recherche dans le titre ou le client (facultatif)") }),
    allowed: (u) => can(u, "projets"),
    run: async (u, a) => rows(sql`
      SELECT p.id, p.title AS titre, p.status AS statut, p.type, c.name AS client, ow.name AS responsable,
        p.start_date AS debut, p.end_date AS echeance,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status <> 'annule') AS taches,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'termine') AS terminees,
        '/projets/' || p.id AS lien
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN users ow ON ow.id = p.owner_id
      WHERE ${projectScope(u)}
        AND (${str(a.statut)} = '' OR p.status = ${str(a.statut)})
        AND (${str(a.texte)} = '' OR p.title ILIKE ${like(a.texte)} OR COALESCE(c.name,'') ILIKE ${like(a.texte)})
      ORDER BY p.end_date NULLS LAST LIMIT 40`),
  },
  {
    name: "lister_taches",
    label: "Je consulte les tâches",
    description: `Tâches avec dates, personnes et statut. Statuts : ${Object.keys(TASK_STATUS).join(", ")}. Utiliser en_retard=true pour les tâches en retard, et une période (du/au) pour « cette semaine », « demain », etc.`,
    parameters: obj({
      statut: S("Statut (facultatif)"), personne: S("Nom (ou partie du nom) de la personne assignée (facultatif)"),
      projet_id: I("Projet (facultatif)"), en_retard: { type: "boolean", description: "Seulement les tâches en retard" },
      du: S("Échéance à partir de (AAAA-MM-JJ, facultatif)"), au: S("Échéance jusqu'au (AAAA-MM-JJ, facultatif)"),
      ouvertes_seulement: { type: "boolean", description: "Exclure les tâches terminées et annulées (par défaut oui)" },
    }),
    allowed: (u) => taskScope(u) !== "none",
    run: async (u, a) => {
      const t = today();
      const own = taskScope(u) === "own";
      const open = a.ouvertes_seulement !== false && !str(a.statut);
      return rows(sql`
        SELECT t.id, t.title AS titre, t.status AS statut, t.priority AS priorite, t.start_date AS debut, t.start_time AS heure_debut,
          t.due_date AS fin, t.due_time AS heure_fin, p.title AS projet,
          (SELECT string_agg(u.name, ', ') FROM task_assignees a JOIN users u ON u.id = a.user_id WHERE a.task_id = t.id) AS personnes,
          (t.due_date < ${t}::date AND t.status NOT IN ('termine','annule')) AS en_retard,
          '/taches/' || t.id AS lien
        FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE (${!own} OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ${u.id}))
          AND (${!open} OR t.status NOT IN ('termine','annule'))
          AND (${str(a.statut)} = '' OR t.status = ${str(a.statut)})
          AND (${num(a.projet_id)} = 0 OR t.project_id = ${num(a.projet_id)})
          AND (${a.en_retard !== true} OR (t.due_date < ${t}::date AND t.status NOT IN ('termine','annule')))
          AND (${date(a.du)} = '' OR t.due_date >= ${date(a.du, "1900-01-01")}::date)
          AND (${date(a.au)} = '' OR t.due_date <= ${date(a.au, "2999-12-31")}::date)
          AND (${str(a.personne)} = '' OR EXISTS (SELECT 1 FROM task_assignees a JOIN users u ON u.id = a.user_id WHERE a.task_id = t.id AND u.name ILIKE ${like(a.personne)}))
        ORDER BY t.due_date NULLS LAST, t.due_time NULLS LAST LIMIT 60`);
    },
  },
  {
    name: "presences_du_jour",
    label: "Je regarde les présences",
    description: "Présence de toute l'équipe un jour donné : présent, absent, en retard, heure d'arrivée et de départ, temps travaillé, absences justifiées.",
    parameters: obj({ date: S("Jour (AAAA-MM-JJ). Par défaut aujourd'hui.") }),
    allowed: (u) => can(u, "presences", "write"),
    run: async (_u, a) => {
      const live = await todayLive(date(a.date) || undefined);
      return {
        jour: live.today,
        ferie: live.holiday,
        resume: { presents: live.stats.present, effectif: live.stats.total, en_retard: live.stats.late, absents: live.stats.absent, pas_encore_pointe: live.stats.notYet, absences_justifiees: live.stats.justified },
        equipe: live.rows.map((r) => ({
          nom: r.person.name, etat: r.live, arrivee: r.row.arrival, depart: r.row.departure,
          retard_min: r.row.lateMin, travaille_min: r.workedMin, detail: r.row.detail || undefined,
        })),
        lien: `/presences?date=${live.today}`,
      };
    },
  },
  {
    name: "absences_et_conges",
    label: "Je regarde les absences et congés",
    description: "Demandes de congé / d'absence et absences enregistrées sur une période, avec leur statut et le solde de congés.",
    parameters: obj({ du: S("Début de période (AAAA-MM-JJ, par défaut il y a 30 jours)"), au: S("Fin de période (AAAA-MM-JJ, par défaut dans 60 jours)"), personne: S("Nom de la personne (facultatif)") }),
    allowed: () => true,
    run: async (u, a) => {
      const t = today();
      const du = date(a.du, addDays(t, -30));
      const au = date(a.au, addDays(t, 60));
      const all = canSeeLeave(u);
      const demandes = await rows(sql`
        SELECT r.id, u.name AS personne, r.kind AS type, r.start_date AS du, r.end_date AS au, r.days AS jours, r.status AS statut, r.reason AS motif, r.decision_note AS decision
        FROM leave_requests r JOIN users u ON u.id = r.user_id
        WHERE r.end_date >= ${du}::date AND r.start_date <= ${au}::date
          AND (${all} OR r.user_id = ${u.id})
          AND (${str(a.personne)} = '' OR u.name ILIKE ${like(a.personne)})
        ORDER BY r.start_date`);
      const ids = all ? (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.active, true))).map((x) => x.id) : [u.id];
      const soldes = await leaveBalances(ids, t);
      const names = new Map((await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)).map((x) => [x.id, x.name]));
      return {
        types: LEAVE_KIND, statuts: LEAVE_STATUS, demandes,
        soldes_conges: [...soldes.entries()].map(([id, b]) => ({ personne: names.get(id), restant: b.left, sur: b.entitled, pris: b.taken, en_attente: b.pending })),
        lien: all ? "/rh" : "/mes-conges",
      };
    },
  },
  {
    name: "lister_equipe",
    label: "Je consulte l'équipe",
    description: "Membres actifs de l'équipe (id, nom, poste, rôle). Utile pour assigner une tâche.",
    parameters: obj({}),
    allowed: () => true,
    run: async (u) => {
      const people = await db.select({ id: schema.users.id, nom: schema.users.name, poste: schema.users.jobTitle, role: schema.users.role })
        .from(schema.users).where(eq(schema.users.active, true));
      if (!canSeePayroll(u)) return people;
      const contracts = await rows<{ user_id: number; contract_type: string; monthly_salary: number; end_date: string | null }>(sql`
        SELECT DISTINCT ON (user_id) user_id, contract_type, monthly_salary, end_date FROM employment_contracts
        WHERE start_date <= ${today()}::date AND (end_date IS NULL OR end_date >= ${today()}::date) ORDER BY user_id, start_date DESC`);
      return people.map((p) => {
        const c = contracts.find((x) => x.user_id === p.id);
        return { ...p, contrat: c ? CONTRACT_TYPE[c.contract_type] : null, salaire_mensuel_fdj: c?.monthly_salary ?? null, fin_contrat: c?.end_date ?? null };
      });
    },
  },
  {
    name: "lister_devis",
    label: "Je consulte les devis",
    description: `Devis avec client, objet, montant et statut. Statuts : ${Object.keys(QUOTE_STATUS).join(", ")}.`,
    parameters: obj({ statut: S("Statut (facultatif)"), client_id: I("Client (facultatif)") }),
    allowed: (u) => can(u, "devis"),
    run: async (_u, a) => rows(sql`
      SELECT q.id, q.number AS numero, c.name AS client, q.subject AS objet, q.status AS statut, q.total AS total_fdj, q.issue_date AS date, q.valid_until AS valable_jusqu_au, '/devis/' || q.id AS lien
      FROM quotes q JOIN clients c ON c.id = q.client_id
      WHERE (${str(a.statut)} = '' OR q.status = ${str(a.statut)}) AND (${num(a.client_id)} = 0 OR q.client_id = ${num(a.client_id)})
      ORDER BY q.issue_date DESC LIMIT 30`),
  },
  {
    name: "lister_factures",
    label: "Je consulte les factures",
    description: "Factures avec montant, payé, reste dû et retard. filtre = impayees | retard | toutes.",
    parameters: obj({ filtre: S("impayees, retard ou toutes", { enum: ["impayees", "retard", "toutes"] }), client_id: I("Client (facultatif)") }),
    allowed: (u) => can(u, "factures"),
    run: async (_u, a) => {
      let list = (await invoicesFinance(num(a.client_id) ? sql`i.client_id = ${num(a.client_id)}` : undefined)).filter((i) => i.status !== "annulee");
      if (a.filtre === "impayees") list = list.filter((i) => i.remaining > 0);
      if (a.filtre === "retard") list = list.filter((i) => i.overdue);
      return list.slice(0, 40).map((i) => ({ id: i.id, numero: i.number, client: i.clientName, objet: i.subject, date: i.issueDate, total_fdj: i.total, reste_fdj: i.remaining, statut: i.paymentStatus, en_retard: i.overdue, lien: `/factures/${i.id}` }));
    },
  },
  {
    name: "lister_depenses",
    label: "Je consulte les dépenses",
    description: `Dépenses d'un mois avec catégorie, fournisseur, projet. Catégories : ${Object.keys(EXPENSE_CATEGORIES).join(", ")}.`,
    parameters: obj({ mois: S("Mois AAAA-MM (par défaut le mois en cours)") }),
    allowed: (u) => can(u, "depenses"),
    run: async (_u, a) => {
      const m = /^\d{4}-\d{2}$/.test(str(a.mois)) ? str(a.mois) : today().slice(0, 7);
      const list = await rows<{ montant_fdj: number }>(sql`
        SELECT e.id, e.date, e.category AS categorie, e.description, e.supplier AS fournisseur, e.amount AS montant_fdj, p.title AS projet
        FROM expenses e LEFT JOIN projects p ON p.id = e.project_id WHERE to_char(e.date,'YYYY-MM') = ${m} ORDER BY e.date DESC LIMIT 60`);
      return { mois: m, total_fdj: list.reduce((s, x) => s + Number(x.montant_fdj), 0), depenses: list, lien: `/depenses?m=${m}` };
    },
  },
  {
    name: "lister_paiements",
    label: "Je consulte les paiements",
    description: "Paiements reçus d'un mois (client, facture, mode, montant).",
    parameters: obj({ mois: S("Mois AAAA-MM (par défaut le mois en cours)") }),
    allowed: (u) => can(u, "paiements"),
    run: async (_u, a) => {
      const m = /^\d{4}-\d{2}$/.test(str(a.mois)) ? str(a.mois) : today().slice(0, 7);
      const list = await rows<{ montant_fdj: number }>(sql`
        SELECT pa.date, pa.amount AS montant_fdj, pa.method AS mode, c.name AS client, i.number AS facture, '/factures/' || i.id AS lien
        FROM payments pa JOIN invoices i ON i.id = pa.invoice_id JOIN clients c ON c.id = i.client_id
        WHERE to_char(pa.date,'YYYY-MM') = ${m} ORDER BY pa.date DESC LIMIT 60`);
      return { mois: m, total_fdj: list.reduce((s, x) => s + Number(x.montant_fdj), 0), paiements: list };
    },
  },
  {
    name: "catalogue",
    label: "Je consulte le catalogue",
    description: "Services et produits du catalogue avec leur prix (pour construire un devis).",
    parameters: obj({ texte: S("Recherche (facultatif)") }),
    allowed: (u) => can(u, "catalogue") || can(u, "devis"),
    run: async (_u, a) => rows(sql`
      SELECT id, name AS nom, description, category AS categorie, unit AS unite, unit_price AS prix_unitaire_fdj
      FROM catalog_items WHERE active AND (${str(a.texte)} = '' OR name ILIKE ${like(a.texte)} OR COALESCE(category,'') ILIKE ${like(a.texte)})
      ORDER BY category, name LIMIT 60`),
  },
  {
    name: "lister_contrats",
    label: "Je consulte les contrats",
    description: "Contrats clients (numéro, client, dates, montant, statut) et modèles de contrat disponibles.",
    parameters: obj({ statut: S("Statut (facultatif)") }),
    allowed: (u) => can(u, "contrats"),
    run: async (_u, a) => ({
      contrats: await rows(sql`
        SELECT id, number AS numero, client_name AS client, title AS titre, status AS statut, start_date AS debut, end_date AS fin,
          amount_mode AS mode_montant, monthly_amount AS mensuel_fdj, total_amount AS total_fdj, '/contrats/' || id AS lien
        FROM contracts WHERE (${str(a.statut)} = '' OR status = ${str(a.statut)}) ORDER BY created_at DESC LIMIT 30`),
      modeles: (await loadTemplates()).map((t) => ({ id: t.id, nom: t.name, description: t.description, mode_montant: t.amountMode, duree: t.durationValue, unite: t.durationUnit })),
    }),
  },
  {
    name: "lister_materiel",
    label: "Je consulte le matériel",
    description: "Inventaire du matériel (référence, état, disponibilité, emplacement).",
    parameters: obj({ texte: S("Recherche (facultatif)") }),
    allowed: (u) => can(u, "materiel"),
    run: async (_u, a) => rows(sql`
      SELECT e.id, e.ref AS reference, e.name AS nom, e.condition AS etat, e.availability AS disponibilite, l.name AS emplacement, '/materiel/' || e.id AS lien
      FROM equipment e LEFT JOIN equipment_locations l ON l.id = e.location_id
      WHERE ${str(a.texte)} = '' OR e.name ILIKE ${like(a.texte)} OR e.ref ILIKE ${like(a.texte)} OR COALESCE(e.brand,'') ILIKE ${like(a.texte)}
      ORDER BY e.name LIMIT 50`),
  },

  /* ───────────── Création ───────────── */
  {
    name: "creer_client",
    label: "Je crée le client",
    write: true,
    description: "Crée une fiche client. À appeler seulement après confirmation explicite de l'utilisateur.",
    parameters: obj({
      nom: S("Nom ou raison sociale"), type: S("entreprise ou particulier", { enum: ["entreprise", "particulier"] }),
      telephone: S("Téléphone"), email: S("E-mail"), adresse: S("Adresse"), nif: S("NIF"),
      representant: S("Nom du représentant légal"), fonction_representant: S("Fonction du représentant"),
    }, ["nom"]),
    allowed: (u) => can(u, "clients", "write"),
    run: async (_u, a) => {
      const [c] = await db.insert(schema.clients).values({
        name: str(a.nom), type: a.type === "particulier" ? "particulier" : "entreprise",
        phone: str(a.telephone) || null, email: str(a.email) || null, address: str(a.adresse) || null, nif: str(a.nif) || null,
        repName: str(a.representant) || null, repTitle: str(a.fonction_representant) || null,
      }).returning({ id: schema.clients.id });
      return { ok: true, client_id: c.id, lien: `/clients/${c.id}` };
    },
  },
  {
    name: "creer_tache",
    label: "Je crée la tâche",
    write: true,
    description: `Crée une tâche (et l'assigne). Priorités : ${Object.keys(PRIORITY).join(", ")}. À appeler seulement après confirmation explicite.`,
    parameters: obj({
      titre: S("Titre"), description: S("Description"), projet_id: I("Projet (facultatif)"),
      personnes_ids: { type: "array", items: { type: "integer" }, description: "Identifiants des personnes assignées (voir lister_equipe)" },
      date_debut: S("AAAA-MM-JJ"), heure_debut: S("HH:MM"), date_fin: S("AAAA-MM-JJ"), heure_fin: S("HH:MM"),
      priorite: S("basse, normale, haute ou urgente"), sous_taches: { type: "array", items: { type: "string" }, description: "Sous-tâches à cocher" },
    }, ["titre"]),
    allowed: (u) => taskScope(u) !== "none",
    run: async (u, a) => {
      const projectId = num(a.projet_id) || null;
      let clientId: number | null = null;
      if (projectId) clientId = (await db.select({ c: schema.projects.clientId }).from(schema.projects).where(eq(schema.projects.id, projectId)))[0]?.c ?? null;
      const hm = (v: unknown) => (/^\d{2}:\d{2}$/.test(str(v)) ? str(v) : null);
      const [t] = await db.insert(schema.tasks).values({
        title: str(a.titre), description: str(a.description) || null, projectId, clientId,
        startDate: date(a.date_debut) || null, startTime: hm(a.heure_debut), dueDate: date(a.date_fin) || date(a.date_debut) || null, dueTime: hm(a.heure_fin),
        priority: str(a.priorite) in PRIORITY ? str(a.priorite) : "normale", status: "a_faire",
        personal: taskScope(u) !== "write" && !projectId, createdBy: u.id,
      }).returning({ id: schema.tasks.id });
      const people = taskScope(u) === "write" ? (Array.isArray(a.personnes_ids) ? a.personnes_ids.map(Number).filter(Boolean) : []) : [u.id];
      await setAssignees(t.id, people.length ? people : [u.id]);
      const subs = Array.isArray(a.sous_taches) ? a.sous_taches.map(str).filter(Boolean) : [];
      if (subs.length) await db.insert(schema.taskChecklistItems).values(subs.map((label, i) => ({ taskId: t.id, label, position: i })));
      await logTask(t.id, u.id, "creation", `${str(a.titre)} (via Aicha)`);
      await notify(people, "assign", `${u.name} vous a assigné « ${str(a.titre)} »`, t.id, u.id);
      return { ok: true, tache_id: t.id, lien: `/taches/${t.id}` };
    },
  },
  {
    name: "creer_devis",
    label: "Je prépare le devis",
    write: true,
    description: "Crée un devis brouillon. Les lignes peuvent venir du catalogue (catalogue_id) ou être libres. À appeler seulement après confirmation explicite.",
    parameters: obj({
      client_id: I("Client"), projet_id: I("Projet (facultatif)"), objet: S("Objet du devis"),
      lignes: { type: "array", items: obj({ designation: S("Libellé"), description: S("Détail"), quantite: N("Quantité"), prix_unitaire_fdj: N("Prix unitaire en FDJ"), unite: S("Unité"), catalogue_id: I("Élément du catalogue (facultatif)"), remise_pct: N("Remise sur la ligne en %") }, ["designation", "quantite", "prix_unitaire_fdj"]) },
      remise_fdj: N("Remise globale en FDJ"), acompte_pct: I("Acompte en % (par défaut 50)"), validite_jours: I("Validité en jours (par défaut celle des paramètres)"), notes: S("Notes"),
    }, ["client_id", "objet", "lignes"]),
    allowed: (u) => can(u, "devis", "write"),
    run: async (u, a) => {
      const doc = await buildDoc(a);
      if ("erreur" in doc) return doc;
      const st = await getSettings();
      const issue = today();
      const number = await nextNumber("PN", issue);
      const id = await db.transaction(async (tx) => {
        const [q] = await tx.insert(schema.quotes).values({
          number, clientId: doc.clientId, projectId: doc.projectId, subject: doc.subject, issueDate: issue,
          validUntil: addDays(issue, num(a.validite_jours) || st.quoteValidityDays), discount: doc.discount,
          depositPercent: doc.deposit, subtotal: doc.subtotal, total: doc.total, notes: doc.notes, createdBy: u.id,
        }).returning({ id: schema.quotes.id });
        await tx.insert(schema.quoteItems).values(doc.lines.map((l) => ({ ...l, quoteId: q.id })));
        return q.id;
      });
      return { ok: true, devis_id: id, numero: number, total_fdj: doc.total, lien: `/devis/${id}` };
    },
  },
  {
    name: "creer_facture",
    label: "Je prépare la facture",
    write: true,
    description: "Crée une facture : soit à partir d'un devis existant (devis_id), soit avec des lignes. À appeler seulement après confirmation explicite.",
    parameters: obj({
      devis_id: I("Convertir ce devis en facture (facultatif)"), client_id: I("Client (si pas de devis)"), projet_id: I("Projet"), objet: S("Objet"),
      lignes: { type: "array", items: obj({ designation: S("Libellé"), description: S("Détail"), quantite: N("Quantité"), prix_unitaire_fdj: N("Prix unitaire FDJ"), unite: S("Unité"), catalogue_id: I("Catalogue"), remise_pct: N("Remise %") }, ["designation", "quantite", "prix_unitaire_fdj"]) },
      remise_fdj: N("Remise globale FDJ"), acompte_pct: I("Acompte %"), notes: S("Notes"),
    }),
    allowed: (u) => can(u, "factures", "write"),
    run: async (u, a) => {
      const d = today();
      if (num(a.devis_id)) {
        const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, num(a.devis_id)));
        if (!q) return { erreur: "Devis introuvable." };
        const [already] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.quoteId, q.id));
        if (already) return { erreur: "Ce devis a déjà une facture.", lien: `/factures/${already.id}` };
        const items = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, q.id));
        const number = await nextNumber("FAC", d);
        const id = await db.transaction(async (tx) => {
          const [inv] = await tx.insert(schema.invoices).values({ number, quoteId: q.id, clientId: q.clientId, projectId: q.projectId, subject: q.subject, issueDate: d, discount: q.discount, subtotal: q.subtotal, total: q.total, notes: q.notes, createdBy: u.id }).returning({ id: schema.invoices.id });
          if (items.length) await tx.insert(schema.invoiceItems).values(items.map(({ id: _i, quoteId: _q, ...rest }) => ({ ...rest, invoiceId: inv.id })));
          await tx.insert(schema.installments).values(schedule(inv.id, q.total, q.depositPercent, d));
          await tx.update(schema.quotes).set({ status: "accepte" }).where(eq(schema.quotes.id, q.id));
          return inv.id;
        });
        return { ok: true, facture_id: id, numero: number, total_fdj: q.total, lien: `/factures/${id}` };
      }
      const doc = await buildDoc(a);
      if ("erreur" in doc) return doc;
      const number = await nextNumber("FAC", d);
      const id = await db.transaction(async (tx) => {
        const [inv] = await tx.insert(schema.invoices).values({ number, clientId: doc.clientId, projectId: doc.projectId, subject: doc.subject, issueDate: d, discount: doc.discount, subtotal: doc.subtotal, total: doc.total, notes: doc.notes, createdBy: u.id }).returning({ id: schema.invoices.id });
        await tx.insert(schema.invoiceItems).values(doc.lines.map((l) => ({ ...l, invoiceId: inv.id })));
        await tx.insert(schema.installments).values(schedule(inv.id, doc.total, doc.deposit, d));
        return inv.id;
      });
      return { ok: true, facture_id: id, numero: number, total_fdj: doc.total, lien: `/factures/${id}` };
    },
  },
  {
    name: "creer_contrat",
    label: "Je rédige le contrat",
    write: true,
    description: "Crée un contrat brouillon à partir d'un modèle (voir lister_contrats) et d'un client : articles du modèle, coordonnées du client, dates et montants. L'utilisateur le relit ensuite dans l'éditeur. À appeler seulement après confirmation explicite.",
    parameters: obj({
      modele_id: I("Modèle de contrat"), client_id: I("Client"), projet_id: I("Projet (facultatif)"),
      date_debut: S("AAAA-MM-JJ"), duree: I("Durée (nombre)"), unite_duree: S("months ou days", { enum: ["months", "days"] }),
      montant_mensuel_fdj: N("Forfait mensuel (si contrat mensuel)"), montant_total_fdj: N("Montant total (si montant unique)"),
      prestations: { type: "array", items: obj({ prestation: S("Nom"), contenu: S("Contenu"), volume: S("Volume / fréquence") }, ["prestation"]) },
    }, ["modele_id", "client_id"]),
    allowed: (u) => can(u, "contrats", "write"),
    run: async (u, a) => {
      const tpl = (await loadTemplates()).find((t) => t.id === num(a.modele_id));
      if (!tpl) return { erreur: "Modèle introuvable. Utilisez lister_contrats pour voir les modèles." };
      const client = await clientSnapshot(num(a.client_id));
      if (!client) return { erreur: "Client introuvable." };
      const st = await getSettings();
      const start = date(a.date_debut) || null;
      const unit = a.unite_duree === "days" ? "days" : (tpl.durationUnit as "months" | "days") || "months";
      const value = num(a.duree) || tpl.durationValue || null;
      const monthly = Math.round(num(a.montant_mensuel_fdj));
      const totalIn = Math.round(num(a.montant_total_fdj));
      const mode = tpl.amountMode === "flat" || (totalIn && !monthly) ? "flat" : "monthly";
      const services = Array.isArray(a.prestations) && a.prestations.length
        ? (a.prestations as Json[]).map((p) => ({ prestation: str(p.prestation), contenu: str(p.contenu), volume: str(p.volume) }))
        : tpl.services;
      const number = await nextNumber("CTR", today());
      const [c] = await db.insert(schema.contracts).values({
        number, status: "brouillon", projectId: num(a.projet_id) || null, templateName: tpl.name,
        title: tpl.title, subtitle: tpl.subtitle, preamble: tpl.preamble,
        startDate: start, endDate: start && value ? addDuration(start, value, unit) : null, durationValue: value, durationUnit: unit,
        amountMode: mode, monthlyAmount: mode === "monthly" ? monthly : 0, totalAmount: mode === "flat" ? totalIn : (monthly && value && unit === "months" ? monthly * value : 0),
        paymentTerms: st.paymentTerms, paymentMethods: st.paymentMethods, includeSignature: true,
        ...client, services, definitions: tpl.definitions, sections: tpl.sections, createdBy: u.id,
      }).returning({ id: schema.contracts.id });
      return { ok: true, contrat_id: c.id, numero: number, lien: `/contrats/${c.id}`, a_relire: `/contrats/${c.id}/modifier` };
    },
  },
  {
    name: "creer_depense",
    label: "J'enregistre la dépense",
    write: true,
    description: `Enregistre une dépense. Catégories : ${Object.keys(EXPENSE_CATEGORIES).join(", ")}. Modes : ${Object.keys(PAYMENT_METHODS).join(", ")}. À appeler seulement après confirmation explicite.`,
    parameters: obj({ montant_fdj: N("Montant"), description: S("Description"), categorie: S("Catégorie"), date: S("AAAA-MM-JJ (défaut aujourd'hui)"), fournisseur: S("Fournisseur"), mode: S("Mode de paiement"), projet_id: I("Projet (facultatif)") }, ["montant_fdj", "description"]),
    allowed: (u) => can(u, "depenses", "write"),
    run: async (u, a) => {
      const [e] = await db.insert(schema.expenses).values({
        amount: Math.round(num(a.montant_fdj)), description: str(a.description),
        category: str(a.categorie) in EXPENSE_CATEGORIES ? str(a.categorie) : "autre",
        date: date(a.date, today()), supplier: str(a.fournisseur) || null,
        method: str(a.mode) in PAYMENT_METHODS ? str(a.mode) : null, projectId: num(a.projet_id) || null, createdBy: u.id,
      }).returning({ id: schema.expenses.id });
      return { ok: true, depense_id: e.id, lien: `/depenses?edit=${e.id}` };
    },
  },
  {
    name: "demander_conge",
    label: "J'envoie la demande de congé",
    write: true,
    description: `Envoie une demande de congé ou d'absence pour l'utilisateur connecté (validation par un responsable). Types : ${Object.keys(LEAVE_KIND).filter((k) => k !== "maladie").join(", ")}. Un arrêt maladie demande un certificat : orienter vers la page Mes congés. À appeler seulement après confirmation explicite.`,
    parameters: obj({ type: S("Type"), du: S("AAAA-MM-JJ"), au: S("AAAA-MM-JJ"), motif: S("Motif") }, ["type", "du", "au"]),
    allowed: () => true,
    run: async (u, a) => {
      const kind = str(a.type);
      if (kind === "maladie") return { erreur: "Un arrêt maladie nécessite le certificat : utilisez la page « Mes congés ».", lien: "/mes-conges?nouvelle=1" };
      if (!(kind in LEAVE_KIND)) return { erreur: "Type inconnu." };
      const du = date(a.du), au = date(a.au, du);
      if (!du || au < du) return { erreur: "Dates invalides." };
      const days = await workingDays(du, au);
      if (!days) return { erreur: "Ces dates ne contiennent aucun jour travaillé." };
      const [r] = await db.insert(schema.leaveRequests).values({ userId: u.id, kind, startDate: du, endDate: au, days, reason: str(a.motif) }).returning({ id: schema.leaveRequests.id });
      await notify(await managersAndAdmins(), "rh_demande", `${u.name} demande : ${LEAVE_KIND[kind].label.toLowerCase()} du ${du.split("-").reverse().join("/")} au ${au.split("-").reverse().join("/")} (${days} j)`, undefined, u.id, "/rh");
      return { ok: true, demande_id: r.id, jours: days, lien: "/mes-conges" };
    },
  },
];

/** Lignes et totaux d'un devis ou d'une facture, à partir des arguments de l'IA. */
async function buildDoc(a: Json) {
  const clientId = num(a.client_id);
  if (!clientId || !(await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.id, clientId)))[0]) return { erreur: "Client introuvable : utilisez chercher_clients." };
  const raw = Array.isArray(a.lignes) ? (a.lignes as Json[]) : [];
  if (!raw.length) return { erreur: "Il faut au moins une ligne." };
  const catIds = raw.map((l) => num(l.catalogue_id)).filter(Boolean);
  const cat = catIds.length ? await db.select().from(schema.catalogItems).where(inArray(schema.catalogItems.id, catIds)) : [];
  const lines = raw.map((l, i) => {
    const c = cat.find((x) => x.id === num(l.catalogue_id));
    const quantity = Math.max(0, num(l.quantite) || 1);
    const unitPrice = Math.round(num(l.prix_unitaire_fdj) || c?.unitPrice || 0);
    const discountPct = Math.min(100, Math.max(0, num(l.remise_pct)));
    return {
      catalogItemId: c?.id ?? null, eventTypeId: null, designation: str(l.designation) || c?.name || "Prestation",
      description: str(l.description) || c?.description || "", quantity: String(quantity), unit: str(l.unite) || c?.unit || "",
      unitPrice, discountPct, total: lineTotal(quantity, unitPrice, discountPct), position: i,
    };
  });
  const totals = docTotals(lines.map((l) => ({ ...l, quantity: Number(l.quantity) })), num(a.remise_fdj));
  return {
    clientId, projectId: num(a.projet_id) || null, subject: str(a.objet) || "Prestation", lines,
    discount: totals.discount, subtotal: totals.subtotal, total: totals.total,
    deposit: Math.min(100, Math.max(0, a.acompte_pct == null ? 50 : num(a.acompte_pct))), notes: str(a.notes) || null,
  };
}

function schedule(invoiceId: number, total: number, depositPct: number, d: string) {
  const dep = Math.round((total * depositPct) / 100);
  return dep > 0 && dep < total
    ? [
      { invoiceId, label: `Acompte ${depositPct} % à la commande`, amount: dep, dueDate: d, position: 0 },
      { invoiceId, label: "Solde à la livraison", amount: total - dep, dueDate: null, position: 1 },
    ]
    : [{ invoiceId, label: "Paiement intégral", amount: total, dueDate: d, position: 0 }];
}

/** Outils proposés au modèle pour cet utilisateur (seulement ceux qu'il a le droit d'utiliser). */
export function toolsFor(u: SessionUser) {
  return TOOLS.filter((t) => t.allowed(u));
}

export async function runTool(u: SessionUser, name: string, args: Json) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { erreur: `Outil inconnu : ${name}` };
  if (!tool.allowed(u)) return denied();
  try {
    return await tool.run(u, args ?? {});
  } catch (e) {
    return { erreur: `L'opération a échoué : ${(e as Error).message.slice(0, 200)}` };
  }
}


