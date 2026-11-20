import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PRIORITY, dateFr, taskSignal, today } from "@/lib/format";
import { PageHeader, Empty, TaskMark } from "@/components/ui";
import { taskScope } from "@/lib/tasks";
import { createTask, setStatus } from "./actions";

export default async function TasksPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requirePerm("taches");
  const scope = taskScope(user);
  const q = searchParams.q ?? "";
  const openId = Number(searchParams.t) || 0;
  if (openId > 0) {
    const back = searchParams.projet ? `?back=${encodeURIComponent(`/taches?projet=${searchParams.projet}`)}` : "";
    redirect(`/taches/${openId}${back}`);
  }
  const rows = (await db.execute(sql`
    SELECT t.*, p.title AS project_title, c.name AS client_name,
      (SELECT string_agg(u.name, ', ') FROM task_assignees a JOIN users u ON u.id = a.user_id WHERE a.task_id = t.id) AS assignees
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE (${scope} <> 'own' OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ${user.id}))
      AND (${user.role} = 'admin' OR t.project_id IS NULL OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = ${user.id}) OR EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.owner_id = ${user.id}))
      AND (${q} = '' OR t.title ILIKE ${"%" + q + "%"})
      AND (${searchParams.statut ?? ""} = '' OR t.status = ${searchParams.statut ?? ""})
      AND (${searchParams.priorite ?? ""} = '' OR t.priority = ${searchParams.priorite ?? ""})
      AND (${searchParams.personne ?? ""} = '' OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ${Number(searchParams.personne) || 0}))
      AND (${searchParams.projet ?? ""} = '' OR t.project_id = ${Number(searchParams.projet) || 0})
    ORDER BY t.due_date NULLS LAST, t.id DESC`)).rows as any[];
  const people = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const projects = user.role === "admin"
    ? await db.select().from(schema.projects).orderBy(desc(schema.projects.id))
    : (await db.execute(sql`
        SELECT p.* FROM projects p
        WHERE p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${user.id})
        ORDER BY p.id DESC`)).rows as any[];
  const day = today();
  return (
    <div>
        <PageHeader title="Tâches" subtitle="Toutes les tâches, rangées par projet. Clique une ligne pour ouvrir la page de détails." actions={<Link href="/taches/modeles" className="btn-ghost">Modèles</Link>} />
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href="/taches" className={!searchParams.projet ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Tous les projets</Link>
          {projects.map((p) => (
            <Link key={p.id} href={`/taches?projet=${p.id}`} className={searchParams.projet === String(p.id) ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{p.title}</Link>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-navy-600">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" /> En retard</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-600" /> En cours</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Terminé</span>
        </div>
        <form action={createTask} className="card card-pad mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <div className="lg:col-span-2">
            <label className="label">Nouvelle tâche</label>
            <input name="title" required placeholder="Ex. Monter le teaser" className="input" />
          </div>
          <div>
            <label className="label">Projet</label>
            <select name="projectId" className="input" defaultValue={searchParams.projet ?? ""}>
              <option value="">Sans projet</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Pour qui</label>
            {user.role === "admin" ? (
              <select name="assignees" className="input">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            ) : (
              <input className="input" value={user.name} disabled />
            )}
          </div>
          <button className="btn-primary">Ajouter</button>
        </form>
        {rows.length === 0 ? <Empty title="Aucune tâche pour ce filtre" /> : [...rows.reduce((map, t) => {
          const key = t.project_title || "Sans projet";
          map.set(key, [...(map.get(key) ?? []), t]);
          return map;
        }, new Map<string, any[]>())].map(([project, list]) => {
          const items = list as any[];
          const lateN = items.filter((t) => taskSignal(t.status, t.due_date, day).late).length;
          const doingN = items.filter((t) => taskSignal(t.status, t.due_date, day).key === "doing").length;
          const doneN = items.filter((t) => t.status === "termine").length;
          return (
          <section key={project} className="card mb-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold/30 bg-gold/10 px-4 py-3">
              <p className="min-w-0 font-bold text-navy">{project} · {items.length}</p>
              <div className="flex flex-wrap gap-1.5">
                {lateN > 0 && <span className="badge-red">{lateN} en retard</span>}
                {doingN > 0 && <span className="badge-blue">{doingN} en cours</span>}
                {doneN > 0 && <span className="badge-green">{doneN} terminée{doneN > 1 ? "s" : ""}</span>}
              </div>
            </div>
            <div className="overflow-x-auto">
            <table className="table">
              <tbody>
                {items.map((t) => {
                  const signal = taskSignal(t.status, t.due_date, day);
                  return (
                  <tr key={t.id} className={`clickable ${signal.row}`}>
                    <td>
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 h-8 w-1 shrink-0 rounded-full ${signal.bar}`} aria-hidden />
                        <div className="min-w-0">
                          <Link href={`/taches/${t.id}${searchParams.projet ? `?back=${encodeURIComponent(`/taches?projet=${searchParams.projet}`)}` : ""}`} className="link row-hit">{t.title}</Link>
                          <div className="text-xs text-navy-600/70">
                            {t.assignees || "Non assignée"}
                            {" · "}
                            <span className={signal.date}>{dateFr(t.due_date)}</span>
                            {" · "}
                            {PRIORITY[t.priority] ?? t.priority}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right"><TaskMark status={t.status} due={t.due_date} day={day} aside /></td>
                    <td className="w-32 text-right">
                      {t.status !== "termine" && (
                        <form action={setStatus.bind(null, t.id)} className="row-keep">
                          <input type="hidden" name="finish" value="1" />
                          <input type="hidden" name="back" value={searchParams.projet ? `/taches?projet=${searchParams.projet}` : "/taches"} />
                          <button className="btn-gold btn-sm">Terminé</button>
                        </form>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </section>
          );
        })}
    </div>
  );
}
