import Link from "next/link";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { ChevronLeft, ChevronRight, FileDown, Repeat, Users } from "lucide-react";
import { ensureProductions } from "@/lib/production";
import { ProductionsModal } from "./Productions";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { addDays, today } from "@/lib/format";
import { getSchedule } from "@/lib/attendance/alerts";
import { ABSENCE_KIND } from "@/lib/attendance/labels";
import { Avatar, PageHeader } from "@/components/ui";
import { PlanningBoard } from "./PlanningBoard";
import { PlanningTeam } from "./PlanningTeam";
import { PersonFilter } from "./PersonFilter";
import type { PlanDay, PlanPerson, PlanTask, PlanAbsence } from "./types";

function startOfWeek(iso: string) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", o);

type Search = { vue?: string; offset?: string; jour?: string; personne?: string; productions?: string; production?: string; ok?: string; e?: string };

export default async function PlanningPage({ searchParams }: { searchParams: Search }) {
  const user = await requirePerm("planning");
  const write = user.perms.planning === "write" || user.role === "admin";
  const now = today();
  // Les productions récurrentes créent à l'avance les livrables des prochains mois.
  await ensureProductions();
  const offset = Number(searchParams.offset ?? 0) || 0;
  const start = addDays(startOfWeek(now), offset * 7);
  const end = addDays(start, 6);
  const schedule = await getSchedule();

  const people: PlanPerson[] = (await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color, jobTitle: schema.users.jobTitle })
    .from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name)))
    .map((p) => ({ ...p, color: p.color || "#2C3E50" }));

  // Seuls les profils « écriture » voient le planning des autres.
  const personId = write ? Number(searchParams.personne ?? 0) || 0 : user.id;
  const person = people.find((p) => p.id === personId) ?? null;
  const vue = searchParams.vue === "jour" || searchParams.vue === "semaine" || (searchParams.vue === "equipe" && write)
    ? searchParams.vue
    : write && !personId ? "equipe" : "semaine";

  const days: PlanDay[] = Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(start, i);
    return {
      iso,
      label: fmt(iso, { weekday: "short", day: "numeric", month: "short" }),
      weekday: fmt(iso, { weekday: "short" }).replace(".", ""),
      dayNum: Number(iso.slice(8, 10)),
      rest: !schedule.workDays.includes(new Date(iso + "T12:00:00").getDay()),
    };
  });
  const focus = searchParams.jour && days.some((d) => d.iso === searchParams.jour) ? searchParams.jour : (days.find((d) => d.iso === now)?.iso ?? days[0].iso);

  // Une ligne par tâche, avec la liste de ses personnes (évite les doublons d'une tâche à plusieurs).
  const rows = (await db.execute(sql`
    SELECT t.id, t.title, t.due_date::text AS due, COALESCE(t.start_time, t.due_time) AS time, t.status, t.priority, (t.plan_item_id IS NOT NULL) AS recurring,
           t.project_id, p.title AS project_title,
           COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'color', u.color) ORDER BY u.name)
             FILTER (WHERE u.id IS NOT NULL), '[]') AS assignees
    FROM tasks t
    LEFT JOIN task_assignees a ON a.task_id = t.id
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.status <> 'annule'
      AND (t.due_date IS NULL OR (t.due_date >= ${start}::date AND t.due_date <= ${end}::date))
    GROUP BY t.id, p.title`)).rows as {
      id: number; title: string; due: string | null; time: string | null; status: string; priority: string;
      project_id: number | null; project_title: string | null; assignees: { id: number; name: string; color: string | null }[]; recurring: boolean;
    }[];
  const tasks: PlanTask[] = rows
    .map((t) => ({
      id: t.id,
      title: t.title,
      due: t.due ? t.due.slice(0, 10) : null,
      time: t.time,
      status: t.status,
      priority: t.priority,
      projectId: t.project_id,
      projectTitle: t.project_title,
      assignees: t.assignees.map((a) => ({ ...a, color: a.color || "#2C3E50" })),
      late: !!t.due && t.due.slice(0, 10) < now && t.status !== "termine",
      recurring: !!t.recurring,
    }))
    .filter((t) => write || t.assignees.some((a) => a.id === user.id));

  const absences: PlanAbsence[] = (await db.select().from(schema.attendanceAbsences)
    .where(and(lte(schema.attendanceAbsences.startDate, end), gte(schema.attendanceAbsences.endDate, start))))
    .map((a) => ({ userId: a.userId, start: a.startDate, end: a.endDate, label: ABSENCE_KIND[a.kind] ?? a.kind }));

  const projects = write
    ? await db.select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects).orderBy(asc(schema.projects.title))
    : [];

  const link = (o: Partial<{ vue: string; offset: number; jour: string; personne: number }>) => {
    const p = new URLSearchParams();
    const v = o.vue ?? vue;
    p.set("vue", v);
    const off = o.offset ?? offset;
    if (off) p.set("offset", String(off));
    if (v === "jour") p.set("jour", o.jour ?? focus);
    const who = o.personne ?? (write ? personId : 0);
    if (who && v !== "equipe") p.set("personne", String(who));
    return `/planning?${p.toString()}`;
  };
  const back = link({});
  const range = `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`;

  const weekTasks = (pid: number) => tasks.filter((t) => t.due && t.assignees.some((a) => a.id === pid));
  const tab = (key: string, label: React.ReactNode, href: string) => (
    <Link
      href={href}
      aria-current={vue === key ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition ${vue === key ? "bg-white text-navy  ring-1 ring-navy-100" : "text-navy-600/75 hover:text-navy"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={write ? "Planning" : "Mon planning"}
        subtitle={write ? "Qui fait quoi, jour par jour. Glissez une tâche pour la déplacer ou la confier à quelqu'un." : "Vos tâches de la semaine"}
        actions={
          <>
            {write && <Link href="/planning?productions=1" scroll={false} className="btn-ghost"><Repeat size={16} /> Productions récurrentes</Link>}
            <a className="btn-ghost" href={`/api/pdf/planning?offset=${offset}${personId && write ? `&personne=${personId}` : ""}`}><FileDown size={16} /> Exporter la semaine</a>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 rounded-xl bg-navy-50/80 p-1 ring-1 ring-navy-100/70" aria-label="Affichage">
          {write && tab("equipe", <><Users size={15} /> Équipe</>, link({ vue: "equipe" }))}
          {tab("semaine", "Semaine", link({ vue: "semaine" }))}
          {tab("jour", "Jour", link({ vue: "jour", jour: focus }))}
        </nav>

        <div className="flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-navy-100">
          <Link href={link(vue === "jour" ? { jour: addDays(focus, -1), offset: addDays(focus, -1) < start ? offset - 1 : offset } : { offset: offset - 1 })} className="grid h-8 w-8 place-items-center rounded-lg text-navy hover:bg-navy-50" aria-label={vue === "jour" ? "Jour précédent" : "Semaine précédente"}><ChevronLeft size={18} /></Link>
          <span className="min-w-[11rem] px-2 text-center text-sm font-bold text-navy first-letter:uppercase">
            {vue === "jour" ? fmt(focus, { weekday: "long", day: "numeric", month: "long" }) : range}
          </span>
          <Link href={link(vue === "jour" ? { jour: addDays(focus, 1), offset: addDays(focus, 1) > end ? offset + 1 : offset } : { offset: offset + 1 })} className="grid h-8 w-8 place-items-center rounded-lg text-navy hover:bg-navy-50" aria-label={vue === "jour" ? "Jour suivant" : "Semaine suivante"}><ChevronRight size={18} /></Link>
        </div>
        {(offset !== 0 || (vue === "jour" && focus !== now)) && <Link href={link({ offset: 0, jour: now })} className="btn-ghost btn-sm">Aujourd'hui</Link>}

        {write && vue !== "equipe" && (
          <div className="sm:ml-auto">
            <PersonFilter vue={vue} offset={offset} jour={focus} selectedPersonId={personId} people={people.map((p) => ({ id: p.id, name: p.name }))} />
          </div>
        )}
      </div>

      {person && vue !== "equipe" && (
        <div className="card card-pad mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={person.name} color={person.color} size={48} />
            <div>
              <h2 className="text-lg font-bold text-navy">{person.name}</h2>
              <p className="text-sm text-navy-600/75">
                {person.jobTitle ? `${person.jobTitle} · ` : ""}
                {weekTasks(person.id).length} tâche(s) cette semaine
                {weekTasks(person.id).some((t) => t.late) && <span className="font-bold text-red-700"> · {weekTasks(person.id).filter((t) => t.late).length} en retard</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {absences.filter((a) => a.userId === person.id).map((a, i) => (
              <span key={i} className="badge-blue">{a.label} · {fmt(a.start, { day: "numeric", month: "short" })} → {fmt(a.end, { day: "numeric", month: "short" })}</span>
            ))}
            {write && <Link href={link({ vue: "equipe" })} className="btn-ghost btn-sm"><Users size={15} /> Toute l'équipe</Link>}
          </div>
        </div>
      )}

      {vue === "equipe" ? (
        <PlanningTeam
          days={days}
          today={now}
          people={people}
          tasks={tasks}
          absences={absences}
          write={write}
          back={back}
          personHref={Object.fromEntries(people.map((p) => [p.id, link({ vue: "semaine", personne: p.id })]))}
          dayHref={Object.fromEntries(days.map((d) => [d.iso, link({ vue: "jour", jour: d.iso })]))}
        />
      ) : (
        <PlanningBoard
          mode={vue as "semaine" | "jour"}
          days={vue === "jour" ? days.filter((d) => d.iso === focus) : days}
          today={now}
          people={people}
          tasks={person ? tasks.filter((t) => !t.due || t.assignees.some((a) => a.id === person.id)) : tasks}
          projects={projects}
          write={write}
          back={back}
          focusPersonId={person?.id ?? null}
          dayHref={Object.fromEntries(days.map((d) => [d.iso, link({ vue: "jour", jour: d.iso })]))}
          absences={person ? absences.filter((a) => a.userId === person.id) : []}
        />
      )}
      {write && (searchParams.productions || searchParams.production) && (
        <ProductionsModal today={now} edit={searchParams.production} ok={searchParams.ok} error={searchParams.e} />
      )}
    </>
  );
}
