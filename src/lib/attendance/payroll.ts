import { ABSENCE_KIND, DAY_STATUS_LABEL, reasonLabel } from "./labels";
import { daysOfMonth, formatClock, formatHM, parseHM, weekdayIndex } from "./time";

export type Schedule = { workDays: number[]; startTime: string; endTime: string; lateToleranceMin: number };
export type AbsenceSpan = { startDate: string; endDate: string; kind: string; reason: string };
export type CountablePunch = { kind: "arrivee" | "depart"; at: string; channel: "bureau" | "mission"; status: string; reasons?: string };

export type DayRow = {
  day: string;
  status: string;
  statusLabel: string;
  arrival: string;
  departure: string;
  hoursMin: number;
  hoursLabel: string;
  lateMin: number;
  detail: string;
  missingDepart: boolean;
};

export type MonthTotals = { hoursMin: number; hoursLabel: string; daysWorked: number; lateMin: number; absences: number };

const COUNTED = new Set(["valide"]);

export function lateMinutes(arrival: string, startTime: string, toleranceMin: number) {
  const late = parseHM(arrival) - parseHM(startTime);
  if (late <= toleranceMin) return 0;
  return late;
}

export function pairHours(punches: CountablePunch[]) {
  const counted = punches.filter((p) => COUNTED.has(p.status)).slice().sort((a, b) => a.at.localeCompare(b.at));
  let minutes = 0;
  let open: string | null = null;
  let firstArrival: string | null = null;
  let lastDepart: string | null = null;
  let sawOffice = false;
  let sawMission = false;
  const pending = punches.some((p) => p.status === "a_verifier" || p.status === "mission");
  for (const p of counted) {
    if (p.channel === "mission") sawMission = true;
    else sawOffice = true;
    if (p.kind === "arrivee") {
      if (!open) open = p.at;
      if (!firstArrival) firstArrival = p.at;
    } else if (p.kind === "depart" && open) {
      minutes += Math.max(0, Math.round((Date.parse(p.at) - Date.parse(open)) / 60000));
      lastDepart = p.at;
      open = null;
    }
  }
  return { minutes, firstArrival, lastDepart, missingDepart: !!open, sawOffice, sawMission, pending };
}

export function buildDayRow(input: {
  day: string;
  today: string;
  schedule: Schedule;
  holidayName?: string | null;
  absence?: AbsenceSpan | null;
  punches: CountablePunch[];
}): DayRow {
  const workday = input.schedule.workDays.includes(weekdayIndex(input.day));
  const paired = pairHours(input.punches);
  const visible = input.punches.filter((p) => p.status !== "refuse").slice().sort((a, b) => a.at.localeCompare(b.at));
  const shownArrival = visible.find((p) => p.kind === "arrivee");
  const shownDepart = [...visible].reverse().find((p) => p.kind === "depart");
  const countedArrival = paired.firstArrival ? clockOf(paired.firstArrival) : "";
  const arrival = shownArrival ? clockOf(shownArrival.at) : "";
  const departure = shownDepart ? clockOf(shownDepart.at) : "";
  const missingDepart = paired.missingDepart && input.day < input.today && !shownDepart;
  const justified = input.absence ?? null;
  let status = "repos";
  if (paired.sawOffice) status = "present";
  else if (paired.sawMission) status = "mission";
  else if (justified) status = "justifie";
  else if (input.holidayName) status = "ferie";
  else if (!workday) status = "repos";
  else if (input.day > input.today) status = "avenir";
  else if (paired.pending) status = "attente";
  else status = "absent";
  if (paired.pending && (status === "repos" || status === "absent")) status = "attente";

  const countLate = status === "present" && workday && !input.holidayName && !justified && !!countedArrival;
  const lateMin = countLate ? lateMinutes(countedArrival, input.schedule.startTime, input.schedule.lateToleranceMin) : 0;
  const reasonCodes = [...new Set(visible
    .filter((p) => p.status === "a_verifier" || p.status === "mission")
    .flatMap((p) => (p.reasons ?? "").split(",").map((c) => c.trim()).filter(Boolean)))];
  const pendingDetail = reasonCodes.length ? reasonLabel(reasonCodes.join(",")) : "";
  const detail = justified
    ? `${ABSENCE_KIND[justified.kind] ?? justified.kind} — ${justified.reason}`
    : input.holidayName && status === "ferie"
      ? input.holidayName
      : missingDepart
        ? "Départ oublié"
        : pendingDetail;
  return {
    day: input.day,
    status,
    statusLabel: DAY_STATUS_LABEL[status] ?? status,
    arrival: arrival || "—",
    departure: missingDepart ? "Départ oublié" : departure || "—",
    hoursMin: paired.minutes,
    hoursLabel: formatHM(paired.minutes),
    lateMin,
    detail,
    missingDepart,
  };
}

export function monthRows(input: {
  month: string;
  today: string;
  schedule: Schedule;
  holidays: Map<string, string>;
  absences: AbsenceSpan[];
  punchesByDay: Map<string, CountablePunch[]>;
}) {
  const rows = daysOfMonth(input.month).map((day) => buildDayRow({
    day,
    today: input.today,
    schedule: input.schedule,
    holidayName: input.holidays.get(day) ?? null,
    absence: input.absences.find((a) => a.startDate <= day && day <= a.endDate) ?? null,
    punches: input.punchesByDay.get(day) ?? [],
  }));
  const totals = rows.reduce<MonthTotals>((acc, row) => {
    acc.hoursMin += row.hoursMin;
    acc.lateMin += row.lateMin;
    if (row.status === "present" || row.status === "mission") acc.daysWorked += 1;
    if (row.status === "absent") acc.absences += 1;
    return acc;
  }, { hoursMin: 0, hoursLabel: "", daysWorked: 0, lateMin: 0, absences: 0 });
  totals.hoursLabel = formatHM(totals.hoursMin);
  return { rows, totals };
}

function clockOf(iso: string) {
  const dt = new Date(iso);
  const hh = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Djibouti", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(dt);
  return hh;
}

export function expectedStartLabel(schedule: Schedule) {
  return `${formatClock(parseHM(schedule.startTime))} (tolérance ${schedule.lateToleranceMin} min)`;
}
