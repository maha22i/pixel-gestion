import "server-only";
import { getSchedule } from "./alerts";
import { expectedDayMinutes } from "./payroll";
import { dayBoard } from "./report";
import { djiboutiClock, parseHM } from "./time";

/** État « en direct » d'un employé aujourd'hui, plus fin que le statut de paie. */
export type LiveState =
  | "sur_place" | "parti" | "present" | "depart_oublie" | "mission" | "attente" | "non_pointe" | "absent" | "justifie" | "ferie" | "repos";

export const LIVE_LABEL: Record<LiveState, string> = {
  sur_place: "Au bureau",
  parti: "Parti",
  present: "Présent",
  depart_oublie: "Départ oublié",
  mission: "En mission",
  attente: "À vérifier",
  non_pointe: "Pas encore pointé",
  absent: "Absent",
  justifie: "Absence justifiée",
  ferie: "Férié",
  repos: "Repos",
};

export const LIVE_BADGE: Record<LiveState, string> = {
  sur_place: "badge-green",
  parti: "badge-navy",
  present: "badge-green",
  depart_oublie: "badge-gold",
  mission: "badge-blue",
  attente: "badge-gold",
  non_pointe: "badge-gray",
  absent: "badge-red",
  justifie: "badge-blue",
  ferie: "badge-gray",
  repos: "badge-gray",
};

const RANK: Record<LiveState, number> = {
  sur_place: 0, parti: 1, present: 1, depart_oublie: 2, mission: 2, attente: 3, non_pointe: 4, absent: 5, justifie: 6, ferie: 7, repos: 8,
};

/**
 * Présence de l'équipe pour un jour donné (aujourd'hui par défaut) : qui était là, horaires, temps travaillé.
 * Pour aujourd'hui, la session en cours est comptée jusqu'à maintenant ; pour un jour passé, seules les plages terminées.
 */
export async function todayLive(day?: string) {
  const [board, schedule] = await Promise.all([dayBoard(day), getSchedule()]);
  const clock = djiboutiClock();
  const isToday = board.today === board.realToday;
  const now = Date.now();
  const endMin = parseHM(schedule.endTime);
  const expected = expectedDayMinutes(schedule);

  const rows = board.rows.map(({ person, row, punches }) => {
    // Même règle que la paie : seuls les pointages validés comptent dans le temps travaillé.
    const valid = punches.filter((p) => p.status === "valide").sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
    let open: Date | null = null;
    let closed = 0;
    for (const p of valid) {
      if (p.kind === "arrivee") { if (!open) open = p.punchedAt; }
      else if (open) { closed += (p.punchedAt.getTime() - open.getTime()) / 60000; open = null; }
    }
    const workedMin = Math.max(0, Math.round(closed + (open && isToday ? (now - open.getTime()) / 60000 : 0)));

    let live: LiveState;
    if (row.status === "present") live = isToday ? (open ? "sur_place" : "parti") : (row.missingDepart ? "depart_oublie" : "present");
    else if (row.status === "absent") live = isToday && clock.minutes < endMin ? "non_pointe" : "absent";
    else live = (row.status in LIVE_LABEL ? row.status : "repos") as LiveState;

    const planned = row.status !== "repos" && row.status !== "ferie" && row.status !== "justifie";
    const overtimeMin = workedMin > 0 ? Math.max(0, workedMin - (planned ? expected : 0)) : 0;
    const segments = segmentsOf(punches.filter((p) => p.status !== "refuse"), now, isToday);
    return { person, row, punches, live, workedMin, open: !!open && isToday, overtimeMin, segments };
  }).sort((a, b) => RANK[a.live] - RANK[b.live] || a.row.arrival.localeCompare(b.row.arrival) || a.person.name.localeCompare(b.person.name));

  const count = (s: LiveState) => rows.filter((r) => r.live === s).length;
  return {
    ...board,
    isToday,
    schedule,
    clock,
    expected,
    rows,
    stats: {
      total: rows.length,
      onSite: count("sur_place"),
      left: count("parti"),
      present: count("sur_place") + count("parti") + count("present") + count("depart_oublie"),
      forgot: count("depart_oublie"),
      mission: count("mission"),
      pending: count("attente"),
      notYet: count("non_pointe"),
      absent: count("absent"),
      justified: count("justifie"),
      late: rows.filter((r) => r.row.lateMin > 0).length,
      workedMin: rows.reduce((s, r) => s + r.workedMin, 0),
      overtimeMin: rows.reduce((s, r) => s + r.overtimeMin, 0),
    },
  };
}

export type LiveRow = Awaited<ReturnType<typeof todayLive>>["rows"][number];

/** Plages arrivée → départ (minutes depuis minuit, heure de Djibouti) pour la frise de la journée. */
function segmentsOf(punches: { kind: string; punchedAt: Date }[], now: number, isToday: boolean) {
  const sorted = [...punches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  const out: { from: number; to: number; open: boolean }[] = [];
  let start: Date | null = null;
  for (const p of sorted) {
    if (p.kind === "arrivee") { if (!start) start = p.punchedAt; }
    else if (start) { out.push({ from: minuteOfDay(start), to: minuteOfDay(p.punchedAt), open: false }); start = null; }
  }
  // Jour passé sans départ : on montre juste le point d'arrivée.
  if (start) out.push(isToday ? { from: minuteOfDay(start), to: minuteOfDay(new Date(now)), open: true } : { from: minuteOfDay(start), to: minuteOfDay(start) + 5, open: false });
  return out;
}

function minuteOfDay(d: Date) {
  return djiboutiClock(d).minutes;
}
