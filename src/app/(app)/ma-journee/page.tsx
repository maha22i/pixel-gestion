import Link from "next/link";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requirePerm } from "@/lib/auth";
import { dateFr, today, addDays } from "@/lib/format";
import { taskScope } from "@/lib/tasks";
import { createTask, setStatus } from "../taches/actions";
import { ensureAttendanceAlerts } from "@/lib/attendance/alerts";
import { djiboutiClock, formatDjiboutiTime } from "@/lib/attendance/time";

export default async function MyDay() {
  const user = await requirePerm("taches");
  const scope = taskScope(user);
  const day = today();
  const weekEnd = addDays(day, 6);
  const rows = (await db.execute(sql`
    SELECT t.*, p.title AS project_title, c.name AS client_name
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ${user.id})
      AND t.status <> 'annule'
    ORDER BY t.due_date NULLS LAST, t.id DESC`)).rows as any[];
  const open = (t: any) => t.status !== "termine";
  const late = rows.filter((t) => t.due_date && t.due_date < day && open(t));
  const todayRows = rows.filter((t) => t.due_date === day && open(t));
  const week = rows.filter((t) => t.due_date && t.due_date > day && t.due_date <= weekEnd && open(t));
  const later = rows.filter((t) => (!t.due_date || t.due_date > weekEnd) && open(t) && t.status !== "en_revue");
  const done = rows.filter((t) => t.status === "termine");
  const doneWeek = done.filter((t) => t.due_date && t.due_date >= addDays(day, -6) && t.due_date <= day);
  const hello = new Date().getHours() < 18 ? "Bonjour" : "Bonsoir";
  const first = user.name.split(" ")[0];
  let presenceLine = "";
  if (can(user, "presences")) {
    await ensureAttendanceAlerts();
    const clock = djiboutiClock();
    const punches = await db.select().from(schema.attendancePunches)
      .where(and(eq(schema.attendancePunches.userId, user.id), eq(schema.attendancePunches.day, clock.day), ne(schema.attendancePunches.status, "refuse")))
      .orderBy(asc(schema.attendancePunches.punchedAt));
    const arrival = punches.find((p) => p.kind === "arrivee");
    const departure = [...punches].reverse().find((p) => p.kind === "depart");
    presenceLine = arrival
      ? `Arrivé à ${formatDjiboutiTime(arrival.punchedAt)}${departure ? ` · Parti à ${formatDjiboutiTime(departure.punchedAt)}` : ""}`
      : "Pas encore pointé aujourd'hui";
  }
  const stats = [
    { label: "Aujourd'hui", value: todayRows.length, hint: "à faire" },
    { label: "En retard", value: late.length, hint: late.length ? "à rattraper" : "rien en retard" },
    { label: "Cette semaine", value: week.length, hint: "à venir" },
    { label: "Terminées", value: done.length, hint: doneWeek.length ? `${doneWeek.length} cette semaine` : "au total" },
  ];
  const sections = [
    { title: "Aujourd'hui", list: todayRows, accent: "border-gold" },
    { title: "En retard", list: late, accent: "border-red-500" },
    { title: "Cette semaine", list: week, accent: "border-navy" },
    { title: "Plus tard", list: later, accent: "border-navy-600/30" },
  ].filter((s) => s.list.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-gold">{dateFr(day)}</p>
          <h1 className="text-3xl font-bold text-navy">{hello} {first}</h1>
        </div>
        {scope !== "write" && (
          <form action={createTask} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
            <input type="hidden" name="personal" value="on" />
            <input type="hidden" name="back" value="/ma-journee" />
            <input name="title" required placeholder="Nouvelle tâche personnelle" className="input" />
            <button className="btn-primary min-h-12 whitespace-nowrap">+ Nouvelle tâche</button>
          </form>
        )}
      </div>

      {presenceLine && (
        <Link href="/pointer" className="card card-pad flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="h-section">Pointage</p>
            <p className="mt-1 text-lg font-bold text-navy">{presenceLine}</p>
          </div>
          <span className="btn-primary">Pointer</span>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card card-pad">
            <p className="text-sm font-bold text-navy-600">{s.label}</p>
            <p className="mt-1 text-3xl font-bold text-navy">{s.value}</p>
            <p className="text-sm text-navy-600/70">{s.hint}</p>
          </div>
        ))}
      </div>

      {sections.length === 0 ? (
        <div className="card card-pad py-16 text-center">
          <p className="text-lg font-bold text-navy">Rien à faire pour le moment</p>
          <p className="mt-1 text-navy-600">Tes tâches apparaîtront ici dès qu’on t’en affectera.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((s) => (
            <section key={s.title} className={`card overflow-hidden border-t-4 ${s.accent}`}>
              <div className="flex items-center justify-between px-5 pt-4">
                <h2 className="font-bold text-navy">{s.title}</h2>
                <span className="badge-gold">{s.list.length}</span>
              </div>
              <ul className="divide-y divide-navy/5">
                {s.list.map((t) => (
                  <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/taches/${t.id}?back=${encodeURIComponent("/ma-journee")}`} className="font-bold text-navy hover:text-gold">{t.title}</Link>
                      <p className="truncate text-sm text-navy-600">{t.project_title || "Sans projet"}{t.due_date ? ` · ${dateFr(t.due_date)}` : ""}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {t.status !== "en_cours" && (
                        <form action={setStatus.bind(null, t.id)}>
                          <input type="hidden" name="status" value="en_cours" />
                          <input type="hidden" name="back" value="/ma-journee" />
                          <button className="btn-ghost btn-sm">En cours</button>
                        </form>
                      )}
                      <form action={setStatus.bind(null, t.id)}>
                        <input type="hidden" name="finish" value="1" />
                        <input type="hidden" name="back" value="/ma-journee" />
                        <button className="btn-gold btn-sm">Terminé</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section className="card card-pad">
          <h2 className="mb-3 font-bold text-navy">Terminées récemment</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {done.slice(0, 6).map((t) => (
              <li key={t.id} className="rounded-xl bg-navy/[0.03] px-4 py-3">
                <Link href={`/taches/${t.id}?back=${encodeURIComponent("/ma-journee")}`} className="font-bold text-navy-600 line-through decoration-gold">{t.title}</Link>
                <p className="text-sm text-navy-600/70">{t.project_title || "Sans projet"}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
