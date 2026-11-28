import Link from "next/link";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Pause, Pencil, Play, Plus, Repeat, Trash2, X } from "lucide-react";
import { db, schema } from "@/db";
import { Avatar } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { ConfirmButton } from "@/components/ConfirmButton";
import { WEEKDAY_SHORT, addMonths, monthLabel } from "@/lib/production";
import { deletePlan, savePlan, togglePlan } from "./productionActions";
import { PlanForm } from "./PlanForm";

const OK: Record<string, string> = {
  cree: "Production créée : les livrables sont dans le planning.",
  modifie: "Production mise à jour. Les livrables à venir ont été recalculés.",
  pause: "Production suspendue. Les livrables à venir non commencés ont été retirés.",
  reprise: "Production relancée.",
  supprime: "Production supprimée. Les livrables déjà commencés restent dans les tâches.",
};
const ERR: Record<string, string> = {
  plan: "Vérifiez le projet, le nom et les mois.",
  lignes: "Ajoutez au moins un livrable.",
  heures: "L'heure de fin doit être après l'heure de début.",
};

const days = (s: string) => s.split(",").filter(Boolean).map((d) => WEEKDAY_SHORT[Number(d)]).join(" · ");

/** Fenêtre « Productions récurrentes » : liste, ou formulaire si `edit` est fourni. */
export async function ProductionsModal({ today, edit, ok, error }: { today: string; edit?: string; ok?: string; error?: string }) {
  const month = today.slice(0, 7);
  const projects = (await db.execute(sql`
    SELECT p.id, p.title, c.name AS client FROM projects p LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.status NOT IN ('annule', 'cloture') ORDER BY p.title`)).rows as { id: number; title: string; client: string | null }[];
  const types = await db.select({ id: schema.taskTypes.id, name: schema.taskTypes.name }).from(schema.taskTypes).orderBy(asc(schema.taskTypes.position));
  const people = (await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color, jobTitle: schema.users.jobTitle })
    .from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name))).map((p) => ({ ...p, color: p.color || "#2C3E50" }));

  if (edit) {
    const next = addMonths(month, 1);
    const holidays = (await db.select({ day: schema.attendanceHolidays.day }).from(schema.attendanceHolidays)
      .where(sql`to_char(${schema.attendanceHolidays.day}, 'YYYY-MM') = ${next}`)).map((h) => h.day);
    const plan = edit === "nouveau" ? null : (await db.select().from(schema.productionPlans).where(eq(schema.productionPlans.id, Number(edit))))[0];
    const items = plan ? await db.select().from(schema.productionPlanItems).where(eq(schema.productionPlanItems.planId, plan.id)).orderBy(asc(schema.productionPlanItems.position)) : [];
    return (
      <Modal closeHref="/planning" labelledBy="plan-title" width="max-w-3xl">
        <PlanForm
          action={savePlan}
          closeHref="/planning"
          backHref="/planning?productions=1"
          nextMonth={next}
          holidays={holidays}
          projects={projects}
          types={types}
          people={people}
          error={ERR[error ?? ""] ?? ""}
          value={plan ? {
            id: plan.id, projectId: plan.projectId, name: plan.name, startMonth: plan.startMonth, endMonth: plan.endMonth ?? "",
            items: items.map((i) => ({
              id: i.id, label: i.label, perMonth: i.perMonth, weekdays: i.weekdays.split(",").filter(Boolean).map(Number),
              startTime: i.startTime ?? "", endTime: i.endTime ?? "", typeId: i.typeId, assigneeIds: i.assigneeIds.split(",").filter(Boolean).map(Number),
            })),
          } : { projectId: null, name: "", startMonth: month, endMonth: "", items: [] }}
        />
      </Modal>
    );
  }

  const plans = await db.select().from(schema.productionPlans).orderBy(desc(schema.productionPlans.active), asc(schema.productionPlans.name));
  const items = plans.length ? await db.select().from(schema.productionPlanItems).where(inArray(schema.productionPlanItems.planId, plans.map((p) => p.id))).orderBy(asc(schema.productionPlanItems.position)) : [];
  // Avancement du mois : livrables terminés / prévus.
  // Avancement : mois en cours, ou le prochain mois qui contient des livrables.
  const progress = items.length ? (await db.execute(sql`
    SELECT DISTINCT ON (plan_item_id) plan_item_id, plan_period, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'termine')::int AS done
    FROM tasks WHERE plan_period >= ${month} AND plan_item_id IN (${sql.join(items.map((i) => sql`${i.id}`), sql`, `)})
    GROUP BY plan_item_id, plan_period ORDER BY plan_item_id, plan_period`)).rows as { plan_item_id: number; plan_period: string; total: number; done: number }[] : [];
  const who = new Map(people.map((p) => [p.id, p]));

  return (
    <Modal closeHref="/planning" labelledBy="prod-title" width="max-w-3xl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-navy-100 bg-white px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-100 text-amber-800"><Repeat size={20} /></span>
          <div>
            <h2 id="prod-title" className="text-lg font-bold text-navy">Productions récurrentes</h2>
            <p className="text-sm text-navy-600/70">Ce qu'il faut livrer chaque mois, par client ou projet.</p>
          </div>
        </div>
        <Link href="/planning" scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Fermer"><X size={18} /></Link>
      </div>
      {ok && OK[ok] && <p className="mx-5 mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 sm:mx-6">{OK[ok]}</p>}
      <div className="space-y-3 p-5 sm:p-6">
        {plans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-navy-200 px-4 py-8 text-center">
            <p className="font-bold text-navy">Aucune production récurrente</p>
            <p className="mt-1 text-sm text-navy-600/70">Exemple : « Djibouti Telecom : 4 vidéos le mardi + 1 affiche le jeudi, chaque mois ».</p>
          </div>
        ) : plans.map((plan) => {
          const project = projects.find((p) => p.id === plan.projectId);
          const lines = items.filter((i) => i.planId === plan.id);
          return (
            <article key={plan.id} className={`rounded-xl border ${plan.active ? "border-navy-100" : "border-dashed border-navy-200 bg-navy-50/40"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-navy">{plan.name}{!plan.active && <span className="badge-gray">En pause</span>}</p>
                  <p className="text-xs text-navy-600/70">{project ? `${project.title}${project.client ? ` · ${project.client}` : ""}` : "Projet clôturé"} · depuis {monthLabel(plan.startMonth)}{plan.endMonth ? ` jusqu'à ${monthLabel(plan.endMonth)}` : ""}</p>
                </div>
                <div className="flex gap-1">
                  <Link href={`/planning?production=${plan.id}`} scroll={false} className="btn-ghost btn-sm"><Pencil size={14} /> Modifier</Link>
                  <form action={togglePlan}><input type="hidden" name="id" value={plan.id} /><button className="btn-ghost btn-sm" title={plan.active ? "Suspendre" : "Relancer"}>{plan.active ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Relancer</>}</button></form>
                  <form action={deletePlan}><input type="hidden" name="id" value={plan.id} /><ConfirmButton className="btn-ghost btn-sm px-2 hover:text-red-700" message={`Supprimer « ${plan.name} » ? Les livrables à venir non commencés seront retirés du planning.`}><Trash2 size={14} /></ConfirmButton></form>
                </div>
              </div>
              <ul className="mt-3 divide-y divide-navy-100 border-t border-navy-100">
                {lines.map((l) => {
                  const pr = progress.find((p) => p.plan_item_id === l.id);
                  const team = l.assigneeIds.split(",").filter(Boolean).map((id) => who.get(Number(id))).filter(Boolean);
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
                      <span className="min-w-[8rem] font-bold text-navy">{l.label} × {l.perMonth}</span>
                      <span className="text-navy-600/80">{days(l.weekdays) || "jours ouvrés"}{l.startTime ? ` · ${l.startTime}${l.endTime ? `–${l.endTime}` : ""}` : ""}</span>
                      <span className="flex -space-x-1.5">{team.map((p) => <Avatar key={p!.id} name={p!.name} color={p!.color} size={22} />)}</span>
                      {plan.active && (
                        <span className="ml-auto flex items-center gap-2 text-xs text-navy-600">
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-navy-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pr?.total ? (pr.done / pr.total) * 100 : 0}%` }} /></span>
                          {pr ? <>{pr.plan_period === month ? "ce mois" : new Date(`${pr.plan_period}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })} : {pr.done}/{pr.total}</> : "aucun livrable prévu"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
      <div className="sticky bottom-0 flex justify-end border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
        <Link href="/planning?production=nouveau" scroll={false} className="btn-gold"><Plus size={16} /> Nouvelle production</Link>
      </div>
    </Modal>
  );
}
