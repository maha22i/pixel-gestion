import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { today as todayIso } from "@/lib/format";

/** Nombre de mois générés à l'avance (mois en cours compris). */
export const HORIZON_MONTHS = 3;
export const WEEKDAY_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

const ms = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
export const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Jours candidats du mois : jours de semaine choisis, fériés exclus. */
export function candidates(month: string, weekdays: number[], holidays: Set<string>) {
  const out: string[] = [];
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    const day = `${month}-${String(d).padStart(2, "0")}`;
    if (weekdays.includes(new Date(ms(day)).getUTCDay()) && !holidays.has(day)) out.push(day);
  }
  return out;
}

/** Répartit `count` livrables sur les jours candidats, de façon régulière dans le mois. */
export function spread(days: string[], count: number) {
  if (!days.length || count <= 0) return [] as string[];
  if (count >= days.length) return Array.from({ length: count }, (_, i) => days[i % days.length]).sort();
  return Array.from({ length: count }, (_, i) => days[Math.floor((i * days.length) / count)]);
}

const ids = (s: string) => s.split(",").map(Number).filter((n) => n > 0);

/**
 * Crée les tâches manquantes des productions actives sur l'horizon (mois en cours + suivants).
 * Idempotent : un livrable (ligne, mois, numéro) n'est jamais créé deux fois.
 */
export async function ensureProductions(planIds?: number[]) {
  const today = todayIso();
  const current = today.slice(0, 7);
  const plans = await db.select().from(schema.productionPlans).where(
    planIds?.length ? and(eq(schema.productionPlans.active, true), inArray(schema.productionPlans.id, planIds)) : eq(schema.productionPlans.active, true),
  );
  if (!plans.length) return 0;
  const items = await db.select().from(schema.productionPlanItems).where(inArray(schema.productionPlanItems.planId, plans.map((p) => p.id)));
  if (!items.length) return 0;
  const projects = await db.select({ id: schema.projects.id, title: schema.projects.title, clientId: schema.projects.clientId, status: schema.projects.status })
    .from(schema.projects).where(inArray(schema.projects.id, plans.map((p) => p.projectId)));
  const clientIds = projects.map((p) => p.clientId).filter((c): c is number => !!c);
  const clients = new Map(clientIds.length ? (await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(inArray(schema.clients.id, clientIds))).map((c) => [c.id, c.name]) : []);
  const lastMonth = addMonths(current, HORIZON_MONTHS - 1);
  const holidays = new Set((await db.select({ day: schema.attendanceHolidays.day }).from(schema.attendanceHolidays)
    .where(and(gte(schema.attendanceHolidays.day, `${current}-01`), lte(schema.attendanceHolidays.day, `${lastMonth}-31`)))).map((h) => h.day));
  const existing = await db.select({ itemId: schema.tasks.planItemId, period: schema.tasks.planPeriod, seq: schema.tasks.planSeq })
    .from(schema.tasks).where(inArray(schema.tasks.planItemId, items.map((i) => i.id)));
  const have = new Set(existing.map((e) => `${e.itemId}|${e.period}|${e.seq}`));

  let created = 0;
  for (const plan of plans) {
    const project = projects.find((p) => p.id === plan.projectId);
    if (!project || ["annule", "cloture"].includes(project.status)) continue;
    const who = project.clientId ? clients.get(project.clientId) ?? project.title : project.title;
    for (let k = 0; k < HORIZON_MONTHS; k++) {
      const month = addMonths(current, k);
      if (month < plan.startMonth || (plan.endMonth && month > plan.endMonth)) continue;
      for (const item of items.filter((i) => i.planId === plan.id)) {
        const days = candidates(month, ids(item.weekdays).length ? ids(item.weekdays) : [0, 1, 2, 3, 4], holidays);
        const slots = spread(days, item.perMonth);
        const future = days.filter((d) => d >= today);
        let spare = 0;
        for (let seq = 1; seq <= item.perMonth; seq++) {
          if (have.has(`${item.id}|${month}|${seq}`)) continue;
          let day = slots[seq - 1];
          if (!day) continue;
          // Livrable dont la date est déjà passée ce mois-ci : il reste à faire, on le place sur le prochain jour prévu.
          if (day < today) { day = future[Math.min(spare, future.length - 1)]; spare++; }
          if (!day) continue;
          const [t] = await db.insert(schema.tasks).values({
            title: `${item.label} ${seq}/${item.perMonth} — ${who}`,
            description: `${plan.name} · ${monthLabel(month)}`,
            projectId: project.id,
            clientId: project.clientId,
            typeId: item.typeId,
            startDate: day,
            startTime: item.startTime,
            dueDate: day,
            dueTime: item.endTime,
            priority: "normale",
            status: "a_faire",
            createdBy: plan.createdBy,
            planItemId: item.id,
            planPeriod: month,
            planSeq: seq,
          }).onConflictDoNothing().returning({ id: schema.tasks.id });
          if (!t) continue;
          const people = ids(item.assigneeIds);
          if (people.length) await db.insert(schema.taskAssignees).values(people.map((userId) => ({ taskId: t.id, userId }))).onConflictDoNothing();
          have.add(`${item.id}|${month}|${seq}`);
          created++;
        }
      }
    }
  }
  return created;
}

/** Retire les livrables à venir pas encore commencés (pour appliquer une modification ou un arrêt). */
export async function clearUpcoming(itemIds: number[]) {
  if (!itemIds.length) return;
  await db.delete(schema.tasks).where(and(
    inArray(schema.tasks.planItemId, itemIds),
    eq(schema.tasks.status, "a_faire"),
    gte(schema.tasks.dueDate, todayIso()),
  ));
}

