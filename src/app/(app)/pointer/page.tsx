import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { ensureAttendanceAlerts } from "@/lib/attendance/alerts";
import { dayStep } from "@/lib/attendance/dayStep";
import { formatDjiboutiDate, formatDjiboutiTime, addIsoDays, djiboutiClock } from "@/lib/attendance/time";
import { PointerApp } from "./PointerApp";

export const dynamic = "force-dynamic";

export default async function PointerPage() {
  const user = await requirePerm("presences");
  await ensureAttendanceAlerts();
  const clock = djiboutiClock();
  const [me] = await db.select({ consent: schema.users.attendanceConsentAt }).from(schema.users).where(eq(schema.users.id, user.id));
  const punches = await db.select().from(schema.attendancePunches)
    .where(and(eq(schema.attendancePunches.userId, user.id), gte(schema.attendancePunches.day, addIsoDays(clock.day, -6))))
    .orderBy(desc(schema.attendancePunches.punchedAt));
  const todayRows = punches.filter((p) => p.day === clock.day && p.status !== "refuse").slice().reverse();
  const step = dayStep(todayRows);
  const arrival = todayRows.find((p) => p.kind === "arrivee");
  const departure = [...todayRows].reverse().find((p) => p.kind === "depart");
  const todayLine = step === "arrivee" || !arrival
    ? "Pas encore pointé aujourd'hui"
    : step === "depart"
      ? `Arrivé à ${formatDjiboutiTime(arrival.punchedAt)}`
      : `Arrivé à ${formatDjiboutiTime(arrival.punchedAt)} · Parti à ${formatDjiboutiTime((departure ?? arrival).punchedAt)}`;
  const wide = user.role === "admin" || user.perms.presences === "write";
  const tasks = (await db.execute(wide
    ? sql`SELECT id, title FROM tasks WHERE status NOT IN ('annule','termine') ORDER BY due_date NULLS LAST, id DESC LIMIT 40`
    : sql`SELECT t.id, t.title FROM tasks t JOIN task_assignees a ON a.task_id = t.id AND a.user_id = ${user.id} WHERE t.status NOT IN ('annule','termine') ORDER BY t.due_date NULLS LAST, t.id DESC LIMIT 40`
  )).rows as { id: number; title: string }[];
  const projects = (await db.execute(wide
    ? sql`SELECT id, title FROM projects WHERE status NOT IN ('annule','cloture') ORDER BY title LIMIT 40`
    : sql`SELECT p.id, p.title FROM projects p WHERE p.status NOT IN ('annule','cloture') AND (p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ${user.id})) ORDER BY p.title LIMIT 40`
  )).rows as { id: number; title: string }[];
  const slips = (await db.execute(wide
    ? sql`SELECT id, number FROM equipment_slips WHERE status IN ('sorti','attente_controle') ORDER BY out_at DESC LIMIT 20`
    : sql`SELECT s.id, s.number FROM equipment_slips s WHERE s.status IN ('sorti','attente_controle') AND (s.responsible_user_id = ${user.id} OR s.created_by = ${user.id} OR EXISTS (SELECT 1 FROM equipment_slip_members m WHERE m.slip_id = s.id AND m.user_id = ${user.id})) ORDER BY s.out_at DESC LIMIT 20`
  )).rows as { id: number; number: string }[];
  const sites = await db.select({ id: schema.attendanceSites.id, name: schema.attendanceSites.name }).from(schema.attendanceSites);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  return (
    <PointerApp
      consent={!!me?.consent}
      step={step}
      todayLine={todayLine}
      tasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
      projects={projects.map((p) => ({ id: p.id, title: p.title }))}
      slips={slips.map((s) => ({ id: s.id, title: s.number }))}
      week={punches.map((p) => ({
        id: p.id,
        day: formatDjiboutiDate(String(p.day)),
        time: formatDjiboutiTime(p.punchedAt),
        kind: p.kind,
        status: p.status,
        place: p.channel === "mission" ? "Mission" : (p.siteId ? siteName.get(p.siteId) ?? "Bureau" : "Bureau"),
      }))}
    />
  );
}
