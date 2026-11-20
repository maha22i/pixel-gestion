import "server-only";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { notify } from "@/lib/tasks";
import { djiboutiClock, parseHM, weekdayIndex } from "./time";
import { presenceRecipients } from "./punch";

let lastRun = 0;

export async function ensureAttendanceAlerts() {
  if (Date.now() - lastRun < 60_000) return;
  lastRun = Date.now();
  try {
    await runAlerts();
  } catch (error) {
    lastRun = 0;
    console.error("alertes présence", error);
  }
}

async function runAlerts() {
  const clock = djiboutiClock();
  const [schedule] = await db.select().from(schema.attendanceSchedule).where(eq(schema.attendanceSchedule.id, 1));
  if (!schedule) return;
  const workDays = schedule.workDays.split(",").map((n) => Number(n)).filter((n) => Number.isFinite(n));
  const [holiday] = await db.select({ id: schema.attendanceHolidays.id }).from(schema.attendanceHolidays).where(eq(schema.attendanceHolidays.day, clock.day));
  const cutoff = parseHM(schedule.startTime) + schedule.lateToleranceMin;
  if (workDays.includes(weekdayIndex(clock.day)) && !holiday && clock.minutes > cutoff) {
    const missing = (await db.execute(sql`
      SELECT u.id, u.name FROM users u
      WHERE u.active
        AND NOT EXISTS (
          SELECT 1 FROM attendance_absences a
          WHERE a.user_id = u.id AND a.start_date <= ${clock.day}::date AND a.end_date >= ${clock.day}::date)
        AND NOT EXISTS (
          SELECT 1 FROM attendance_punches p
          WHERE p.user_id = u.id AND p.day = ${clock.day}::date AND p.kind = 'arrivee' AND p.status <> 'refuse')
    `)).rows as { id: number; name: string }[];
    const links = new Set((await db.select({ link: schema.notifications.link }).from(schema.notifications)
      .where(eq(schema.notifications.type, "presence_absent"))).map((r) => r.link));
    for (const person of missing) {
      const link = `/presences?alerte=absent&u=${person.id}&jour=${clock.day}`;
      if (links.has(link)) continue;
      const managers = await presenceRecipients(person.id);
      await notify(managers, "presence_absent", `${person.name} n'a pas pointé après ${schedule.startTime} + ${schedule.lateToleranceMin} min.`, undefined, person.id, link);
    }
  }

  const open = (await db.execute(sql`
    SELECT DISTINCT ON (p.user_id) p.user_id, p.day::text AS day, p.kind, u.name
    FROM attendance_punches p
    JOIN users u ON u.id = p.user_id
    WHERE p.day < ${clock.day}::date AND p.status <> 'refuse' AND u.active
    ORDER BY p.user_id, p.punched_at DESC
  `)).rows as { user_id: number; day: string; kind: string; name: string }[];
  const departLinks = new Set((await db.select({ link: schema.notifications.link }).from(schema.notifications)
    .where(eq(schema.notifications.type, "presence_depart"))).map((r) => r.link));
  for (const row of open) {
    if (row.kind !== "arrivee") continue;
    const day = String(row.day).slice(0, 10);
    const link = `/presences?alerte=depart&u=${row.user_id}&jour=${day}`;
    if (departLinks.has(link)) continue;
    const managers = await presenceRecipients(row.user_id);
    await notify(managers, "presence_depart", `Départ oublié : ${row.name}, le ${day.split("-").reverse().join("/")}.`, undefined, row.user_id, link);
  }
}

export async function getSchedule() {
  const [row] = await db.select().from(schema.attendanceSchedule).where(eq(schema.attendanceSchedule.id, 1));
  const workDays = (row?.workDays ?? "0,1,2,3,4").split(",").map((n) => Number(n)).filter((n) => Number.isFinite(n));
  return {
    workDays,
    startTime: row?.startTime ?? "08:00",
    endTime: row?.endTime ?? "17:00",
    lateToleranceMin: row?.lateToleranceMin ?? 15,
  };
}

export async function punchesBetween(userId: number, start: string, end: string) {
  return db.select().from(schema.attendancePunches)
    .where(and(eq(schema.attendancePunches.userId, userId), gte(schema.attendancePunches.day, start), lte(schema.attendancePunches.day, end)))
    .orderBy(asc(schema.attendancePunches.punchedAt));
}

export async function activeUsers() {
  return db.select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.active, true))
    .orderBy(asc(schema.users.name));
}
