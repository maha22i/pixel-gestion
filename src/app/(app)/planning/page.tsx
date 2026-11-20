import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { PlanningBoard } from "./PlanningBoard";
import { PersonFilter } from "./PersonFilter";

function startOfWeek(iso: string) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function PlanningPage({ searchParams }: { searchParams: { vue?: string; we?: string; offset?: string; jour?: string; personne?: string } }) {
  const user = await requirePerm("planning");
  const write = user.perms.planning === "write" || user.role === "admin";
  const isAdmin = user.role === "admin";
  const vue = searchParams.vue === "jour" ? "jour" : "semaine";
  const offset = Number(searchParams.offset ?? 0) || 0;
  const start = addDays(startOfWeek(today()), offset * 7);
  const span = 7;
  const week = Array.from({ length: span }, (_, i) => {
    const iso = addDays(start, i);
    const dt = new Date(iso + "T00:00:00");
    return { iso, label: dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) };
  });
  const focus = searchParams.jour && week.some((d) => d.iso === searchParams.jour) ? searchParams.jour : (week.find((d) => d.iso === today())?.iso ?? week[0].iso);
  const days = vue === "jour" ? week.filter((d) => d.iso === focus) : week;
  const q = offset ? `&offset=${offset}` : "";
  const selectedPersonId = isAdmin ? Number(searchParams.personne ?? 0) || 0 : 0;
  const personQ = isAdmin && selectedPersonId ? `&personne=${selectedPersonId}` : "";
  const people = await db.select().from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  const projects = user.role === "admin"
    ? await db.select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects).orderBy(asc(schema.projects.title))
    : (await db.execute(sql`
        SELECT id, title FROM projects p
        WHERE p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${user.id})
        ORDER BY title`)).rows as { id: number; title: string }[];
  const rows = (await db.execute(sql`
    SELECT t.id, t.title, t.due_date, t.due_time, t.project_id, p.title AS project_title,
           u.id AS user_id, u.name AS user_name, u.color
    FROM tasks t
    LEFT JOIN task_assignees a ON a.task_id = t.id
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.status <> 'annule'`)).rows as any[];
  const tasks = rows
    .filter((t) => write || t.user_id === user.id)
    .filter((t) => !selectedPersonId || t.user_id === selectedPersonId)
    .map((t) => ({
      id: t.id,
      title: t.title,
      due: t.due_date ? String(t.due_date).slice(0, 10) : null,
      time: t.due_time,
      userId: t.user_id,
      userName: t.user_name,
      projectId: t.project_id,
      projectTitle: t.project_title,
      color: t.color || "#2C3E50",
    }));
  const back = `/planning?vue=${vue}${q}${personQ}${vue === "jour" ? `&jour=${focus}` : ""}`;
  return (
    <>
      <PageHeader title={write ? "Planning" : "Mon planning"} subtitle={write ? "Semaine et journée, avec les heures" : "Vos tâches à effectuer"} actions={<a className="btn-ghost" href="/api/pdf/planning">Exporter la semaine</a>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/planning?vue=${vue}&offset=${offset - 1}${personQ}${vue === "jour" ? `&jour=${addDays(focus, -7)}` : ""}`} className="btn-primary btn-sm px-4 text-lg" aria-label="Semaine précédente">←</Link>
        <Link href={`/planning?vue=${vue}${personQ}`} className="btn-ghost btn-sm">Aujourd'hui</Link>
        <Link href={`/planning?vue=${vue}&offset=${offset + 1}${personQ}${vue === "jour" ? `&jour=${addDays(focus, 7)}` : ""}`} className="btn-primary btn-sm px-4 text-lg" aria-label="Semaine suivante">→</Link>
        <span className="px-2 text-sm font-bold text-navy">{week[0].label} — {week[week.length - 1].label}</span>
        <Link href={`/planning?vue=semaine${q}${personQ}`} className={vue === "semaine" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Semaine</Link>
        <Link href={`/planning?vue=jour&jour=${today()}${q}${personQ}`} className={vue === "jour" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Jour</Link>
        {vue === "semaine" && week.map((d) => (
          <Link key={d.iso} href={`/planning?vue=jour&jour=${d.iso}${q}${personQ}`} className="btn-ghost btn-sm">{d.label}</Link>
        ))}
        {isAdmin && <PersonFilter vue={vue} offset={offset} jour={focus} selectedPersonId={selectedPersonId} people={people.map((p) => ({ id: p.id, name: p.name }))} />}
      </div>
      <PlanningBoard mode={vue} days={days} today={today()} people={people.map((p) => ({ id: p.id, name: p.name, color: p.color, jobTitle: p.jobTitle }))} tasks={tasks} projects={projects} write={write} back={back} />
    </>
  );
}
