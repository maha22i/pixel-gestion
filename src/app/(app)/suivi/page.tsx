import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requirePerm } from "@/lib/auth";
import { dateFr, today, addDays } from "@/lib/format";
import { PageHeader, ProjectBadge, Stat } from "@/components/ui";
import { TeamFollow, type FollowEvent, type FollowPerson, type FollowTask } from "./MemberDialog";

export default async function SuiviPage({ searchParams }: { searchParams: { membre?: string } }) {
  await requirePerm("suivi_equipe");
  const day = today();
  const weekEnd = addDays(day, 6);
  const [peopleRes, projectsRes, alertsRes, tasksRes, eventsRes] = await Promise.all([
    db.execute(sql`
      SELECT u.id, u.name, u.color, u.job_title,
        COUNT(t.id) FILTER (WHERE t.status <> 'annule')::int AS assigned,
        COUNT(t.id) FILTER (WHERE t.status = 'en_cours')::int AS doing,
        COUNT(t.id) FILTER (WHERE t.status = 'termine')::int AS done,
        COUNT(t.id) FILTER (WHERE t.due_date < ${day}::date AND t.status NOT IN ('termine','annule'))::int AS late,
        COUNT(t.id) FILTER (WHERE t.due_date BETWEEN ${day}::date AND ${weekEnd}::date AND t.status <> 'annule')::int AS load
      FROM users u
      LEFT JOIN task_assignees a ON a.user_id = u.id
      LEFT JOIN tasks t ON t.id = a.task_id
      WHERE u.active
      GROUP BY u.id
      ORDER BY u.name`),
    db.execute(sql`
      SELECT p.id, p.title, p.end_date, p.status, p.nature,
        COUNT(t.id) FILTER (WHERE t.status <> 'annule')::int AS total,
        COUNT(t.id) FILTER (WHERE t.status = 'termine')::int AS done
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.status NOT IN ('annule','cloture')
      GROUP BY p.id ORDER BY p.end_date NULLS LAST`),
    db.execute(sql`
      SELECT t.id, t.title, t.status, t.due_date::text AS due_date,
        CASE
          WHEN t.status = 'bloque' THEN 'bloque'
          WHEN t.due_date < ${day}::date AND t.status NOT IN ('termine','annule') THEN 'retard'
          ELSE 'revue'
        END AS kind,
        p.title AS project_title,
        (SELECT string_agg(u.name, ', ' ORDER BY u.name)
         FROM task_assignees a JOIN users u ON u.id = a.user_id
         WHERE a.task_id = t.id) AS assignees
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.status = 'bloque'
         OR (t.due_date < ${day}::date AND t.status NOT IN ('termine','annule'))
         OR (t.status = 'en_revue' AND t.created_at < now() - interval '48 hours')
      ORDER BY
        CASE
          WHEN t.status = 'bloque' THEN 0
          WHEN t.due_date < ${day}::date AND t.status NOT IN ('termine','annule') THEN 1
          ELSE 2
        END,
        t.due_date NULLS LAST, t.id`),
    db.execute(sql`
      SELECT a.user_id, t.id, t.title, t.status, t.due_date::text AS due_date, t.priority, p.title AS project_title
      FROM task_assignees a
      JOIN tasks t ON t.id = a.task_id
      JOIN users u ON u.id = a.user_id AND u.active
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.status <> 'annule'
      ORDER BY (t.status = 'termine'), t.due_date NULLS LAST, t.id DESC`),
    db.execute(sql`
      SELECT actor_id, created_at, kind, detail, title
      FROM (
        SELECT e.actor_id, e.created_at, e.kind, e.detail, t.title,
               ROW_NUMBER() OVER (PARTITION BY e.actor_id ORDER BY e.created_at DESC) AS rn
        FROM task_events e
        JOIN tasks t ON t.id = e.task_id
        WHERE e.actor_id IS NOT NULL
      ) ranked
      WHERE rn <= 25
      ORDER BY created_at DESC`),
  ]);
  const people = (peopleRes.rows as any[]).map((p): FollowPerson => ({
    id: Number(p.id),
    name: String(p.name),
    color: String(p.color || "#2C3E50"),
    jobTitle: p.job_title ? String(p.job_title) : "",
    assigned: Number(p.assigned),
    doing: Number(p.doing),
    done: Number(p.done),
    late: Number(p.late),
    load: Number(p.load),
  }));
  const tasks = (tasksRes.rows as any[]).map((t): FollowTask => ({
    id: Number(t.id),
    userId: Number(t.user_id),
    title: String(t.title),
    status: String(t.status),
    dueDate: t.due_date ? String(t.due_date).slice(0, 10) : null,
    priority: String(t.priority),
    project: t.project_title ? String(t.project_title) : null,
  }));
  const events = (eventsRes.rows as any[]).map((e): FollowEvent => ({
    actorId: Number(e.actor_id),
    at: new Date(e.created_at).toISOString(),
    kind: String(e.kind),
    detail: e.detail ? String(e.detail) : null,
    title: String(e.title),
  }));
  const projects = projectsRes.rows as any[];
  const attention = (alertsRes.rows as any[]).map((a) => ({
    id: Number(a.id),
    title: String(a.title),
    kind: String(a.kind) as "retard" | "bloque" | "revue",
    status: String(a.status),
    dueDate: a.due_date ? String(a.due_date).slice(0, 10) : null,
    project: a.project_title ? String(a.project_title) : null,
    assignees: a.assignees ? String(a.assignees) : null,
  }));
  const lateCount = attention.filter((a) => a.kind === "retard").length;
  const blockedCount = attention.filter((a) => a.kind === "bloque").length;
  const reviewCount = attention.filter((a) => a.status === "en_revue").length;
  const member = Number(searchParams.membre) || 0;
  return (
    <>
      <PageHeader title="Suivi de l'équipe" subtitle="Cette semaine" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Équipe" value={people.length} hint="Membres actifs" />
        <Stat label="En retard" value={lateCount} hint="Échéance dépassée" tone={lateCount ? "red" : "navy"} />
        <Stat label="Bloquées" value={blockedCount} hint="En attente" tone={blockedCount ? "gold" : "navy"} />
        <Stat label="En revue" value={reviewCount} hint="Depuis plus de 48 h" tone={reviewCount ? "gold" : "navy"} />
      </div>
      <div className="mb-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.85fr)]">
        <TeamFollow people={people} tasks={tasks} events={events} today={day} initialMemberId={people.some((p) => p.id === member) ? member : 0} />
        <Attention items={attention} today={day} />
      </div>
      <section className="card mb-6 overflow-hidden">
        <p className="h-section px-5 pb-2 pt-5">Projets</p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Projet</th><th>Avancement</th><th>Échéance</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                const late = Boolean(p.end_date && p.end_date < day && pct < 100);
                return (
                  <tr key={p.id} className="clickable">
                    <td><Link className="link row-hit" href={`/projets/${p.id}`}>{p.title}</Link></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-navy-50">
                          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="tabular-nums text-sm">{pct} %</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      {dateFr(p.end_date)}
                      {late && <span className="badge-red ml-2">En retard</span>}
                    </td>
                    <td>{pct === 100 ? <span className="badge-gold">À clôturer</span> : <ProjectBadge s={p.status} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const ATTENTION: Record<string, { label: string; cls: string }> = {
  retard: { label: "En retard", cls: "badge-red" },
  bloque: { label: "Bloquée", cls: "badge-gold" },
  revue: { label: "En revue", cls: "badge-blue" },
};

function daysLate(due: string, day: string) {
  const start = new Date(due + "T00:00:00").getTime();
  const end = new Date(day + "T00:00:00").getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
}

function Attention({
  items,
  today: day,
}: {
  items: { id: number; title: string; kind: "retard" | "bloque" | "revue"; status: string; dueDate: string | null; project: string | null; assignees: string | null }[];
  today: string;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
        <p className="h-section">À traiter</p>
        <span className="text-sm tabular-nums text-navy-600/70">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-navy-600/75">Aucune tâche en retard, bloquée ou en revue.</p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-gold/15 overflow-y-auto">
          {items.map((item) => {
            const tone = ATTENTION[item.kind] ?? ATTENTION.retard;
            const meta = [
              item.project,
              item.assignees,
              item.dueDate ? dateFr(item.dueDate) : null,
              item.kind === "retard" && item.dueDate ? `depuis ${daysLate(item.dueDate, day)} j` : null,
            ].filter(Boolean).join(" · ");
            return (
              <li key={item.id}>
                <Link href={`/taches/${item.id}?back=${encodeURIComponent("/suivi")}`} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-gold/10">
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-navy">{item.title}</span>
                    {meta && <span className="mt-0.5 block truncate text-xs text-navy-600/70">{meta}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className={tone.cls}>{tone.label}</span>
                    {item.status === "en_revue" && item.kind !== "revue" && <span className="badge-blue">En revue</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
