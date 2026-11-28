import "server-only";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { getSchedule } from "@/lib/attendance/alerts";
import { usersWith } from "@/lib/permissions";

export const LEAVE_KIND: Record<string, { label: string; hint: string; needsDoc: boolean; countsLeave: boolean }> = {
  conge: { label: "Congé payé", hint: "Décompté du solde de congés.", needsDoc: false, countsLeave: true },
  maladie: { label: "Arrêt maladie", hint: "Certificat médical obligatoire.", needsDoc: true, countsLeave: false },
  familial: { label: "Événement familial", hint: "Mariage, naissance, décès…", needsDoc: false, countsLeave: false },
  sans_solde: { label: "Congé sans solde", hint: "Non rémunéré, non décompté du solde.", needsDoc: false, countsLeave: false },
  autre: { label: "Autre absence", hint: "Précisez le motif.", needsDoc: false, countsLeave: false },
};

export const LEAVE_STATUS: Record<string, { label: string; badge: string }> = {
  en_attente: { label: "En attente", badge: "badge-gold" },
  approuve: { label: "Validée", badge: "badge-green" },
  refuse: { label: "Refusée", badge: "badge-red" },
  annule: { label: "Annulée", badge: "badge-gray" },
};

export const CONTRACT_TYPE: Record<string, string> = {
  cdi: "CDI",
  cdd: "CDD",
  stage: "Stage",
  prestataire: "Prestataire",
};

/** Voit les demandes de l'équipe (droit « Ressources humaines »). */
export const canSeeLeave = (u: SessionUser) => u.role === "admin" || ["read", "write"].includes(u.perms.rh);
/** Valide les demandes : droit « Ressources humaines » en écriture. */
export const canValidateLeave = (u: SessionUser) => u.role === "admin" || u.perms.rh === "write";
/** Contrats et salaires de l'équipe : administrateurs seulement. */
export const canSeePayroll = (u: SessionUser) => u.role === "admin";

const ms = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Jours ouvrés entre deux dates incluses (jours travaillés de l'horaire, fériés exclus). */
export async function workingDays(start: string, end: string) {
  if (end < start) return 0;
  const schedule = await getSchedule();
  const holidays = new Set((await db.select({ day: schema.attendanceHolidays.day }).from(schema.attendanceHolidays)
    .where(and(gte(schema.attendanceHolidays.day, start), lte(schema.attendanceHolidays.day, end)))).map((h) => h.day));
  let n = 0;
  for (let t = ms(start); t <= ms(end); t += 86400000) {
    const iso = isoOf(t);
    if (schedule.workDays.includes(new Date(t).getUTCDay()) && !holidays.has(iso)) n++;
  }
  return n;
}

/** Contrat en cours de chaque employé (le plus récent commencé et non terminé). */
export async function currentContracts(userIds: number[], today: string) {
  if (!userIds.length) return new Map<number, typeof schema.employmentContracts.$inferSelect>();
  const rows = await db.select().from(schema.employmentContracts)
    .where(and(inArray(schema.employmentContracts.userId, userIds), lte(schema.employmentContracts.startDate, today)))
    .orderBy(desc(schema.employmentContracts.startDate), desc(schema.employmentContracts.id));
  const out = new Map<number, typeof rows[number]>();
  for (const r of rows) if (!out.has(r.userId) && (!r.endDate || r.endDate >= today)) out.set(r.userId, r);
  return out;
}

/** Solde de congés payés de l'année civile : droits annuels − jours validés − jours en attente. */
export async function leaveBalances(userIds: number[], today: string) {
  const year = today.slice(0, 4);
  const contracts = await currentContracts(userIds, today);
  const used = userIds.length ? (await db.execute(sql`
    SELECT user_id,
      COALESCE(SUM(days) FILTER (WHERE status = 'approuve'), 0)::int AS taken,
      COALESCE(SUM(days) FILTER (WHERE status = 'en_attente'), 0)::int AS pending
    FROM leave_requests
    WHERE kind = 'conge' AND to_char(start_date, 'YYYY') = ${year}
      AND user_id IN (${sql.join(userIds.map((i) => sql`${i}`), sql`, `)})
    GROUP BY user_id`)).rows as { user_id: number; taken: number; pending: number }[] : [];
  return new Map(userIds.map((id) => {
    const c = contracts.get(id);
    const u = used.find((x) => x.user_id === id);
    const entitled = c?.leaveDaysPerYear ?? 30;
    const taken = u?.taken ?? 0;
    const pending = u?.pending ?? 0;
    return [id, { entitled, taken, pending, left: entitled - taken - pending, hasContract: !!c }];
  }));
}

/** Personnes à prévenir d'une nouvelle demande : celles qui peuvent la valider. */
export async function managersAndAdmins() {
  return usersWith("rh", "write");
}
