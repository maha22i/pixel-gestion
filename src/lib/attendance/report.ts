import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { monthRows, type AbsenceSpan, type CountablePunch } from "./payroll";
import { activeUsers, getSchedule, punchesBetween } from "./alerts";
import { djiboutiClock, daysOfMonth } from "./time";

export async function monthReport(userId: number, month: string) {
  const today = djiboutiClock().day;
  const schedule = await getSchedule();
  const days = daysOfMonth(month);
  const start = days[0];
  const end = days[days.length - 1];
  const [person] = await db.select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle })
    .from(schema.users).where(eq(schema.users.id, userId));
  const punches = await punchesBetween(userId, start, end);
  const holidays = await db.select().from(schema.attendanceHolidays)
    .where(and(gte(schema.attendanceHolidays.day, start), lte(schema.attendanceHolidays.day, end)));
  const absences = await db.select().from(schema.attendanceAbsences)
    .where(and(eq(schema.attendanceAbsences.userId, userId), lte(schema.attendanceAbsences.startDate, end), gte(schema.attendanceAbsences.endDate, start)));
  const byDay = new Map<string, CountablePunch[]>();
  for (const punch of punches) {
    const list = byDay.get(punch.day) ?? [];
    list.push({
      kind: punch.kind === "depart" ? "depart" : "arrivee",
      at: punch.punchedAt.toISOString(),
      channel: punch.channel === "mission" ? "mission" : "bureau",
      status: punch.status,
      reasons: punch.reasonCodes,
    });
    byDay.set(punch.day, list);
  }
  const built = monthRows({
    month,
    today,
    schedule,
    holidays: new Map(holidays.map((h) => [h.day, h.name])),
    absences: absences.map((a): AbsenceSpan => ({ startDate: a.startDate, endDate: a.endDate, kind: a.kind, reason: a.reason })),
    punchesByDay: byDay,
  });
  return { person, schedule, ...built };
}

export async function teamMonth(month: string) {
  const people = await activeUsers();
  const reports = [];
  for (const person of people) reports.push(await monthReport(person.id, month));
  return reports;
}

/** Présence de toute l'équipe pour un jour donné (aujourd'hui par défaut). */
export async function dayBoard(day?: string) {
  const today = djiboutiClock().day;
  const target = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  const people = await activeUsers();
  const ids = people.map((p) => p.id);
  const punches = ids.length
    ? await db.select().from(schema.attendancePunches).where(and(eq(schema.attendancePunches.day, target), inArray(schema.attendancePunches.userId, ids))).orderBy(asc(schema.attendancePunches.punchedAt))
    : [];
  const [holiday] = await db.select().from(schema.attendanceHolidays).where(eq(schema.attendanceHolidays.day, target));
  const absences = await db.select().from(schema.attendanceAbsences)
    .where(and(lte(schema.attendanceAbsences.startDate, target), gte(schema.attendanceAbsences.endDate, target)));
  const schedule = await getSchedule();
  return {
    today: target,
    realToday: today,
    holiday: holiday?.name ?? null,
    rows: people.map((person) => {
      const mine = punches.filter((p) => p.userId === person.id);
      const built = monthRows({
        month: target.slice(0, 7),
        today,
        schedule,
        holidays: new Map(holiday ? [[target, holiday.name]] : []),
        absences: absences.filter((a) => a.userId === person.id).map((a) => ({ startDate: a.startDate, endDate: a.endDate, kind: a.kind, reason: a.reason })),
        punchesByDay: new Map([[target, mine.map((p) => ({
          kind: p.kind === "depart" ? "depart" as const : "arrivee" as const,
          at: p.punchedAt.toISOString(),
          channel: p.channel === "mission" ? "mission" as const : "bureau" as const,
          status: p.status,
          reasons: p.reasonCodes,
        }))]]),
      }).rows.find((row) => row.day === target);
      return { person, row: built!, punches: mine };
    }),
  };
}

export async function todayBoard() {
  return dayBoard();
}

export async function reviewQueue() {
  const res = await db.execute(sql`
    SELECT p.id, p.user_id, u.name, p.kind, p.channel, p.status, p.punched_at, p.day::text AS day,
      p.lat, p.lng, p.distance_m, p.ip, p.reason_codes, p.note, s.name AS site_name,
      t.title AS task_title, pr.title AS project_title, es.number AS slip_number
    FROM attendance_punches p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN attendance_sites s ON s.id = p.site_id
    LEFT JOIN tasks t ON t.id = p.task_id
    LEFT JOIN projects pr ON pr.id = p.project_id
    LEFT JOIN equipment_slips es ON es.id = p.slip_id
    WHERE p.status IN ('a_verifier', 'mission')
    ORDER BY p.punched_at DESC
    LIMIT 200
  `);
  return res.rows as Record<string, unknown>[];
}

export async function openDepartures(today: string) {
  const res = await db.execute(sql`
    SELECT DISTINCT ON (p.user_id) p.id, p.user_id, u.name, p.kind, p.day::text AS day, p.punched_at
    FROM attendance_punches p
    JOIN users u ON u.id = p.user_id AND u.active
    WHERE p.day < ${today}::date AND p.status <> 'refuse'
    ORDER BY p.user_id, p.punched_at DESC
  `);
  return (res.rows as { id: number; user_id: number; name: string; kind: string; day: string; punched_at: string }[])
    .filter((row) => row.kind === "arrivee");
}
