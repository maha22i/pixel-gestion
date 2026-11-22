import Link from "next/link";
import { headers } from "next/headers";
import { asc, desc, eq, inArray, and, gte, lte, sql } from "drizzle-orm";
import {
  AlarmClock, CalendarCheck, CalendarX2, ChevronLeft, ChevronRight, Clock, Download, FileSpreadsheet, FileText,
  Hourglass, MapPin, PenLine, Plane, TimerReset, UserCheck, UserX, Users,
} from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { Avatar, Empty, PageHeader, SectionCard, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { punchesBetween, ensureAttendanceAlerts } from "@/lib/attendance/alerts";
import { clientIpFromHeaders, normalizeIp } from "@/lib/attendance/ip";
import { ABSENCE_KIND, reasonLabel, STATUS_LABEL } from "@/lib/attendance/labels";
import { LIVE_BADGE, LIVE_LABEL, todayLive } from "@/lib/attendance/live";
import { monthReport, openDepartures, reviewQueue, teamMonth } from "@/lib/attendance/report";
import { addIsoDays, daysOfMonth, djiboutiClock, formatDjiboutiDate, formatDjiboutiTime, formatHM, parseHM, weekdayIndex } from "@/lib/attendance/time";
import { deleteAbsence, manualPunch, resolveDevice, reviewMany, saveAbsence } from "./actions";
import { IpUpdate } from "./IpUpdate";
import { AutoSubmitForm } from "./AutoSubmit";
import { DayTimeline, TimelineScale } from "./DayTimeline";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

type Person = { id: number; name: string; color: string; jobTitle: string | null };

const DAY_BADGE: Record<string, string> = {
  present: "badge-green", mission: "badge-blue", attente: "badge-gold", absent: "badge-red",
  justifie: "badge-blue", ferie: "badge-gray", repos: "badge-gray", avenir: "badge-gray",
};
const WEEKDAY_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const hm = (min: number) => (min > 0 ? formatHM(min) : "—");
/** Durée lisible : « 27 min » sous une heure, sinon « 1 h 05 ». */
const dur = (min: number) => (min < 60 ? `${Math.round(min)} min` : formatHM(min));

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function PresencesPage({ searchParams }: { searchParams: { vue?: string; mois?: string; employe?: string; ok?: string; e?: string } }) {
  await requirePerm("presences", "write");
  await ensureAttendanceAlerts();
  const clock = djiboutiClock();
  const vue = searchParams.vue === "mois" || searchParams.vue === "valider" ? searchParams.vue : "jour";
  const month = /^\d{4}-\d{2}$/.test(searchParams.mois ?? "") ? searchParams.mois! : clock.day.slice(0, 7);
  const people: Person[] = await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color, jobTitle: schema.users.jobTitle })
    .from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  const employeeId = Number(searchParams.employe) || 0;
  const ip = normalizeIp(clientIpFromHeaders(headers()));
  const knownIps = await db.select({ ip: schema.attendanceSiteIps.ip }).from(schema.attendanceSiteIps);
  const ipKnown = !!ip && knownIps.some((row) => normalizeIp(row.ip) === ip);
  const [{ n: toReview }] = (await db.execute(sql`
    SELECT ((SELECT COUNT(*) FROM attendance_punches WHERE status IN ('a_verifier','mission'))
      + (SELECT COUNT(*) FROM attendance_device_requests WHERE status = 'pending'))::int AS n`)).rows as { n: number }[];
  const messages: Record<string, string> = {
    valide: "Pointage validé.",
    refuse: "Pointage refusé.",
    lot: "Pointages mis à jour.",
    ip: "Pointages du réseau mis à jour.",
    correction: "Correction enregistrée.",
    absence: "Absence justifiée enregistrée.",
    telephone: "Téléphone mis à jour.",
  };
  const errors: Record<string, string> = {
    motif: "Un motif est obligatoire pour refuser.",
    correction: "Employé, date, heure et motif sont obligatoires.",
    absence: "Vérifie les dates, le type et le motif.",
    chevauche: "Une absence existe déjà sur ces dates.",
    telephone: "Ce téléphone est déjà lié à un autre employé.",
  };
  const todayRaw = new Date(`${clock.day}T12:00:00+03:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Djibouti" });
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);

  const tab = (key: string, href: string, label: React.ReactNode) => (
    <Link
      href={href}
      aria-current={vue === key ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold transition ${vue === key ? "bg-white text-navy shadow-sm ring-1 ring-navy-100" : "text-navy-600/75 hover:text-navy"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Présences"
        subtitle={today}
        actions={
          <nav className="flex flex-wrap gap-1 rounded-xl bg-navy-50/80 p-1 ring-1 ring-navy-100/70">
            {tab("jour", "/presences", "Aujourd'hui")}
            {tab("mois", `/presences?vue=mois&mois=${month}`, "Mois")}
            {tab("valider", "/presences?vue=valider", <>À valider{toReview > 0 && <span className="rounded-full bg-gold px-1.5 text-[11px] text-navy-900">{toReview}</span>}</>)}
          </nav>
        }
      />
      <Flash message={searchParams.ok ? messages[searchParams.ok] : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e ? errors[searchParams.e] : ""} clear={["e"]} />
      <IpUpdate known={ipKnown} ip={ip} />
      {vue === "jour" && <Today employeeId={employeeId} month={month} people={people} />}
      {vue === "mois" && (employeeId
        ? <Employee month={month} employeeId={employeeId} people={people} today={clock.day} />
        : <Team month={month} people={people} today={clock.day} />)}
      {vue === "valider" && <Queue />}
    </>
  );
}

/* ─────────────────────────── Aujourd'hui ─────────────────────────── */

async function Today({ employeeId, month, people }: { employeeId: number; month: string; people: Person[] }) {
  const live = await todayLive();
  const { stats, schedule } = live;
  const sites = await siteNames();
  const selected = live.rows.find((r) => r.person.id === employeeId) ?? null;
  const forgotten = await openDepartures(live.today);
  const start = parseHM(schedule.startTime);
  const end = parseHM(schedule.endTime);
  const restDay = live.rows.length > 0 && live.rows.every((r) => r.live === "repos" || r.live === "ferie");
  const colors = new Map(people.map((p) => [p.id, p.color]));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Présents" value={<>{stats.present}<span className="text-base text-navy-600/50"> / {stats.total}</span></>} hint={`${stats.onSite} au bureau · ${stats.left} parti(s)`} tone="green" icon={<UserCheck size={18} />} />
        <Stat label="En retard" value={stats.late} hint={`Après ${schedule.startTime} + ${schedule.lateToleranceMin} min`} tone={stats.late ? "red" : "navy"} icon={<AlarmClock size={18} />} />
        <Stat label={live.clock.minutes < end ? "Pas encore pointé" : "Absents"} value={stats.notYet + stats.absent} hint={stats.justified ? `+ ${stats.justified} absence(s) justifiée(s)` : "Sans justificatif"} tone={stats.notYet + stats.absent ? "gold" : "navy"} icon={<UserX size={18} />} />
        <Stat label="À valider" value={stats.mission + stats.pending} hint={stats.pending + stats.mission ? <Link href="/presences?vue=valider" className="link">Valider</Link> : "Rien en attente"} tone="blue" icon={<Plane size={18} />} />
        <Stat label="Temps travaillé" value={formatHM(stats.workedMin)} hint={stats.overtimeMin ? `dont ${dur(stats.overtimeMin)} d'heures sup` : `Horaire ${schedule.startTime} – ${schedule.endTime}`} icon={<Clock size={18} />} className="col-span-2 lg:col-span-1" />
      </div>

      {live.holiday && <p className="rounded-xl bg-gold/15 px-4 py-2.5 font-bold text-navy">Jour férié : {live.holiday}</p>}
      {restDay && !live.holiday && <p className="rounded-xl bg-navy-50 px-4 py-2.5 font-bold text-navy">Jour de repos selon l'horaire. Les pointages éventuels comptent en heures sup.</p>}

      {selected && (
        <SectionCard
          id="detail"
          title={`Pointages du jour · ${selected.person.name}`}
          action={
            <>
              <Link className="btn-ghost btn-sm" href={`/presences?vue=mois&mois=${month}&employe=${selected.person.id}`}>Voir le mois</Link>
              <Link className="btn-ghost btn-sm" href="/presences">Fermer</Link>
            </>
          }
        >
          <PunchList punches={selected.punches} sites={sites} showMap />
        </SectionCard>
      )}

      <SectionCard
        title="Équipe aujourd'hui"
        flush
        action={<span className="text-navy-600/70">Clique un nom pour le détail · <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> en cours <span className="ml-1 inline-block h-2 w-2 rounded-full bg-navy-700" /> terminé</span>}
      >
        {live.rows.length === 0 ? <Empty title="Aucun employé actif" /> : (<>
          {/* Mobile : une ligne compacte par employé */}
          <ul className="divide-y divide-navy-100/70 md:hidden">
            {live.rows.map((r) => (
              <li key={r.person.id}>
                <Link href={`/presences?employe=${r.person.id}#detail`} className={`block px-4 py-3 ${r.person.id === employeeId ? "bg-gold/15" : ""}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.person.name} color={colors.get(r.person.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-navy">{r.person.name}</span>
                      <span className="block truncate text-xs text-navy-600/70">{r.person.jobTitle ?? ""}</span>
                    </span>
                    <span className={LIVE_BADGE[r.live]}>{LIVE_LABEL[r.live]}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-11 text-sm tabular-nums">
                    <span><span className="text-navy-600/60">Arr.</span> <b className="text-navy">{r.row.arrival}</b></span>
                    <span><span className="text-navy-600/60">Dép.</span> <b className="text-navy">{r.row.departure}</b></span>
                    {r.workedMin > 0 && <span><b className="text-navy">{formatHM(r.workedMin)}</b>{r.open && <span className="text-emerald-700"> en cours</span>}</span>}
                    {r.row.lateMin > 0 && <span className="badge-red">retard {dur(r.row.lateMin)}</span>}
                    {r.overtimeMin > 0 && <span className="badge-gold">+{dur(r.overtimeMin)} sup</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr><th>Employé</th><th>Statut</th><th>Arrivée</th><th>Départ</th><th className="text-right">Travaillé</th><th className="text-right">Heures sup</th><th className="hidden w-[24%] xl:table-cell">Journée</th></tr>
              </thead>
              <tbody>
                {live.rows.map((r) => (
                  <tr key={r.person.id} className={`clickable ${r.person.id === employeeId ? "bg-gold/15" : ""}`}>
                    <td>
                      <Link href={`/presences?employe=${r.person.id}#detail`} className="row-hit flex items-center gap-3">
                        <Avatar name={r.person.name} color={colors.get(r.person.id)} />
                        <span className="min-w-0">
                          <span className="block font-bold text-navy">{r.person.name}</span>
                          {r.person.jobTitle && <span className="block text-xs text-navy-600/70">{r.person.jobTitle}</span>}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <span className={LIVE_BADGE[r.live]}>
                        {r.live === "sur_place" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                        {LIVE_LABEL[r.live]}
                      </span>
                      {r.row.detail && r.live !== "justifie" && <span className="mt-1 block text-xs text-navy-600/70">{r.row.detail}</span>}
                      {r.live === "justifie" && <span className="mt-1 block text-xs text-navy-600/70">{r.row.detail}</span>}
                    </td>
                    <td className="tabular-nums">
                      {r.row.arrival}
                      {r.row.lateMin > 0 && <span className="badge-red ml-2">+{dur(r.row.lateMin)}</span>}
                    </td>
                    <td className="tabular-nums">{r.row.departure}</td>
                    <td className="num font-bold text-navy">
                      {r.workedMin ? formatHM(r.workedMin) : "—"}
                      {r.open && <span className="block text-[11px] font-semibold text-emerald-700">en cours</span>}
                    </td>
                    <td className={`num ${r.overtimeMin ? "font-bold text-amber-700" : "text-navy-600/50"}`}>{r.overtimeMin ? `+${dur(r.overtimeMin)}` : "—"}</td>
                    <td className="hidden xl:table-cell">
                      <DayTimeline segments={r.segments} start={start} end={end} now={live.clock.minutes} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hidden px-5 pb-4 xl:grid xl:grid-cols-[1fr_24%] xl:gap-4 xl:pr-4"><span /><TimelineScale /></div>
          </div>
        </>)}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <Corrections people={people} />
        {forgotten.length > 0 && (
          <SectionCard title={`Départs oubliés (${forgotten.length})`} className="h-fit">
            <ul className="divide-y divide-navy-100/70">
              {forgotten.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span><span className="font-bold text-navy">{row.name}</span> · {formatDjiboutiDate(String(row.day).slice(0, 10))} · arrivée {formatDjiboutiTime(new Date(row.punched_at))}</span>
                  <a href="#correction" className="link text-xs">Corriger</a>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Mois : équipe ─────────────────────────── */

async function Team({ month, people, today }: { month: string; people: Person[]; today: string }) {
  const reports = (await teamMonth(month)).filter((r) => r.person);
  const colors = new Map(people.map((p) => [p.id, p.color]));
  const sum = (f: (t: (typeof reports)[number]["totals"]) => number) => reports.reduce((s, r) => s + f(r.totals), 0);
  const isPast = month < today.slice(0, 7);
  const elapsed = isPast ? "le mois" : month === today.slice(0, 7) ? `au ${formatDjiboutiDate(today)}` : "";

  return (
    <div className="space-y-6">
      <MonthBar month={month} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Heures travaillées" value={formatHM(sum((t) => t.hoursMin))} hint={`Prévu ${formatHM(sum((t) => t.expectedMin))} ${elapsed}`} icon={<Clock size={18} />} />
        <Stat label="Heures sup" value={formatHM(sum((t) => t.overtimeMin))} hint="Au-delà de l'horaire, jours complets" tone="gold" icon={<Hourglass size={18} />} />
        <Stat label="Retards" value={sum((t) => t.lateDays)} hint={`${dur(sum((t) => t.lateMin))} cumulées`} tone={sum((t) => t.lateDays) ? "red" : "navy"} icon={<AlarmClock size={18} />} />
        <Stat label="Absences" value={sum((t) => t.absences)} hint={`non justifiées · ${sum((t) => t.justified)} justifiée(s)`} tone={sum((t) => t.absences) ? "red" : "navy"} icon={<CalendarX2 size={18} />} />
      </div>

      <SectionCard
        title={`Synthèse de l'équipe · ${monthLabel(month)}`}
        flush
        action={<a className="btn-gold btn-sm" href={`/api/presences/export?mois=${month}&format=xlsx`}><FileSpreadsheet size={15} /> Excel paie (tous)</a>}
      >
        {reports.length === 0 ? <Empty title="Aucun employé actif" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Employé</th><th className="text-right">Jours</th><th className="text-right">Heures</th><th className="text-right">Prévu</th>
                  <th className="text-right">Heures sup</th><th className="text-right">Retards</th><th className="text-right">Absences</th><th className="w-[14%]">Assiduité</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(({ person, totals }) => {
                  const ratio = totals.expectedMin ? Math.round((totals.hoursMin / totals.expectedMin) * 100) : 0;
                  return (
                    <tr key={person!.id} className="clickable">
                      <td>
                        <Link href={`/presences?vue=mois&mois=${month}&employe=${person!.id}`} className="row-hit flex items-center gap-3">
                          <Avatar name={person!.name} color={colors.get(person!.id)} />
                          <span className="min-w-0">
                            <span className="block font-bold text-navy">{person!.name}</span>
                            {person!.jobTitle && <span className="block text-xs text-navy-600/70">{person!.jobTitle}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="num">{totals.daysWorked}</td>
                      <td className="num font-bold text-navy">{hm(totals.hoursMin)}</td>
                      <td className="num text-navy-600/70">{hm(totals.expectedMin)}</td>
                      <td className={`num ${totals.overtimeMin ? "font-bold text-amber-700" : "text-navy-600/50"}`}>{totals.overtimeMin ? `+${dur(totals.overtimeMin)}` : "—"}</td>
                      <td className="num">
                        {totals.lateDays ? <span className="font-bold text-red-700">{totals.lateDays} j</span> : <span className="text-navy-600/50">—</span>}
                        {totals.lateMin > 0 && <span className="block text-xs text-navy-600/70">{dur(totals.lateMin)}</span>}
                      </td>
                      <td className="num">
                        {totals.absences ? <span className="font-bold text-red-700">{totals.absences}</span> : <span className="text-navy-600/50">0</span>}
                        {totals.justified > 0 && <span className="block text-xs text-navy-600/70">+{totals.justified} justifiée(s)</span>}
                      </td>
                      <td>
                        {totals.expectedMin ? (
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy-50">
                              <div className={`h-full rounded-full ${ratio >= 100 ? "bg-emerald-500" : ratio >= 90 ? "bg-gold" : "bg-red-400"}`} style={{ width: `${Math.min(100, ratio)}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs font-bold tabular-nums text-navy-600">{ratio} %</span>
                          </div>
                        ) : <span className="text-navy-600/50">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <Absences people={people} month={month} />
        <Corrections people={people} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Mois : un employé ─────────────────────────── */

async function Employee({ month, employeeId, people, today }: { month: string; employeeId: number; people: Person[]; today: string }) {
  const report = await monthReport(employeeId, month);
  const person = people.find((p) => p.id === employeeId);
  if (!report.person || !person) return <><MonthBar month={month} /><div className="card"><Empty title="Employé introuvable" /></div></>;
  const days = daysOfMonth(month);
  const punches = await punchesBetween(employeeId, days[0], days[days.length - 1]);
  const sites = await siteNames();
  const t = report.totals;
  const ratio = t.expectedMin ? Math.round((t.hoursMin / t.expectedMin) * 100) : 0;

  return (
    <div className="space-y-6">
      <MonthBar month={month} employeeId={employeeId} people={people} />

      <div className="card card-pad flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={person.name} color={person.color} size={52} />
          <div>
            <h2 className="text-xl font-bold text-navy">{person.name}</h2>
            <p className="text-sm text-navy-600/75">{person.jobTitle || "—"} · horaire {report.schedule.startTime} – {report.schedule.endTime}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost btn-sm" href={`/api/presences/export?mois=${month}&user=${employeeId}&format=pdf`}><FileText size={15} /> PDF</a>
          <a className="btn-ghost btn-sm" href={`/api/presences/export?mois=${month}&user=${employeeId}&format=xlsx`}><Download size={15} /> Excel</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Heures travaillées" value={formatHM(t.hoursMin)} hint={`sur ${formatHM(t.expectedMin)} prévues (${ratio} %)`} icon={<Clock size={18} />} />
        <Stat label="Heures sup" value={formatHM(t.overtimeMin)} hint="Au-delà de l'horaire" tone="gold" icon={<Hourglass size={18} />} />
        <Stat label="Jours travaillés" value={t.daysWorked} hint={t.justified ? `+ ${t.justified} jour(s) justifié(s)` : "Présent ou en mission"} tone="green" icon={<CalendarCheck size={18} />} />
        <Stat label="Retards" value={t.lateDays} hint={`${dur(t.lateMin)} cumulées`} tone={t.lateDays ? "red" : "navy"} icon={<AlarmClock size={18} />} />
        <Stat label="Absences" value={t.absences} hint="Non justifiées" tone={t.absences ? "red" : "navy"} icon={<CalendarX2 size={18} />} className="col-span-2 lg:col-span-1" />
      </div>

      <SectionCard title={`Jour par jour · ${monthLabel(month)}`} flush>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Statut</th><th>Arrivée</th><th>Départ</th><th className="text-right">Heures</th><th className="text-right">Heures sup</th><th className="text-right">Retard</th><th>Détail</th></tr></thead>
            <tbody>
              {report.rows.map((row) => {
                const quiet = row.status === "repos" || row.status === "avenir";
                return (
                  <tr key={row.day} className={`${quiet ? "text-navy-600/45" : ""} ${row.day === today ? "bg-gold/10" : ""}`}>
                    <td className="whitespace-nowrap tabular-nums">
                      <span className="inline-block w-9 text-navy-600/60">{WEEKDAY_SHORT[weekdayIndex(row.day)]}</span>
                      <span className={quiet ? "" : "font-bold text-navy"}>{formatDjiboutiDate(row.day).slice(0, 5)}</span>
                    </td>
                    <td>{quiet ? <span className="text-sm">{row.statusLabel}</span> : <span className={DAY_BADGE[row.status] ?? "badge-gray"}>{row.statusLabel}</span>}</td>
                    <td className="tabular-nums">{row.arrival}</td>
                    <td className={`tabular-nums ${row.missingDepart ? "font-bold text-red-700" : ""}`}>{row.departure}</td>
                    <td className="num">{row.hoursMin ? <span className="font-bold text-navy">{formatHM(row.hoursMin)}</span> : "—"}</td>
                    <td className={`num ${row.overtimeMin ? "font-bold text-amber-700" : ""}`}>{row.overtimeMin ? `+${dur(row.overtimeMin)}` : "—"}</td>
                    <td className={`num ${row.lateMin ? "font-bold text-red-700" : ""}`}>{row.lateMin ? dur(row.lateMin) : "—"}</td>
                    <td className="text-sm text-navy-600/80">{row.detail || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-gold/20 px-5 py-4 text-sm font-bold text-navy sm:px-6">
          <span>Total {formatHM(t.hoursMin)}</span>
          <span className="text-amber-700">Heures sup +{dur(t.overtimeMin)}</span>
          <span>{t.daysWorked} jours travaillés</span>
          <span className={t.lateMin ? "text-red-700" : ""}>{dur(t.lateMin)} de retard</span>
          <span className={t.absences ? "text-red-700" : ""}>{t.absences} absence(s) non justifiée(s)</span>
        </div>
      </SectionCard>

      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="h-section">Tous les pointages du mois ({punches.length})</span>
          <ChevronRight size={18} className="text-navy-600/60 transition group-open:rotate-90" />
        </summary>
        <div className="px-5 pb-5 sm:px-6">
          <PunchList punches={punches} sites={sites} />
        </div>
      </details>

      <div className="grid gap-6 xl:grid-cols-2">
        <Absences people={people} month={month} userId={employeeId} />
        <Corrections people={people} userId={employeeId} />
      </div>
    </div>
  );
}

function MonthBar({ month, employeeId, people }: { month: string; employeeId?: number; people?: Person[] }) {
  const q = (m: string) => `/presences?vue=mois&mois=${m}${employeeId ? `&employe=${employeeId}` : ""}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {employeeId ? (
        <Link href={`/presences?vue=mois&mois=${month}`} className="btn-ghost btn-sm"><Users size={15} /> Toute l'équipe</Link>
      ) : null}
      <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-navy-100">
        <Link href={q(shiftMonth(month, -1))} className="grid h-8 w-8 place-items-center rounded-lg text-navy hover:bg-navy-50" aria-label="Mois précédent"><ChevronLeft size={18} /></Link>
        <span className="min-w-[9.5rem] px-2 text-center text-sm font-bold text-navy first-letter:uppercase">{monthLabel(month)}</span>
        <Link href={q(shiftMonth(month, 1))} className="grid h-8 w-8 place-items-center rounded-lg text-navy hover:bg-navy-50" aria-label="Mois suivant"><ChevronRight size={18} /></Link>
      </div>
      <AutoSubmitForm action="/presences" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="vue" value="mois" />
        <input className="input h-9 w-auto" type="month" name="mois" defaultValue={month} aria-label="Choisir le mois" />
        {people && (
          <select className="input h-9 w-auto" name="employe" defaultValue={String(employeeId ?? "")} aria-label="Employé">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <noscript><button className="btn-primary btn-sm">Afficher</button></noscript>
      </AutoSubmitForm>
    </div>
  );
}

/* ─────────────────────────── Absences & corrections ─────────────────────────── */

async function Absences({ people, month, userId }: { people: Person[]; month: string; userId?: number }) {
  const days = daysOfMonth(month);
  const conds = [lte(schema.attendanceAbsences.startDate, days[days.length - 1]), gte(schema.attendanceAbsences.endDate, addIsoDays(days[0], -60))];
  if (userId) conds.push(eq(schema.attendanceAbsences.userId, userId));
  const absences = await db.select().from(schema.attendanceAbsences).where(and(...conds)).orderBy(desc(schema.attendanceAbsences.startDate)).limit(30);
  const names = new Map(people.map((p) => [p.id, p]));
  return (
    <SectionCard title="Absences justifiées" className="h-fit">
      {absences.length === 0 ? <p className="text-sm text-navy-600/70">Aucune absence justifiée récente.</p> : (
        <ul className="divide-y divide-navy-100/70">
          {absences.map((a) => {
            const p = names.get(a.userId);
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-3">
                  {p && <Avatar name={p.name} color={p.color} size={28} />}
                  <span className="min-w-0 text-sm">
                    <span className="font-bold text-navy">{p?.name ?? a.userId}</span> <span className="badge-blue ml-1">{ABSENCE_KIND[a.kind] ?? a.kind}</span>
                    <span className="block text-navy-600/75">{formatDjiboutiDate(a.startDate)} → {formatDjiboutiDate(a.endDate)} · {a.reason}</span>
                  </span>
                </span>
                <form action={deleteAbsence}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="userId" value={userId ?? ""} />
                  <input type="hidden" name="mois" value={month} />
                  <button className="btn-ghost btn-sm">Retirer</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      <details className="mt-4 rounded-xl border border-navy-100 bg-navy-50/40 open:bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-navy [&::-webkit-details-marker]:hidden">
          <CalendarCheck size={16} className="text-gold-600" /> Déclarer une absence justifiée
        </summary>
        <form action={saveAbsence} className="grid gap-3 px-4 pb-4 md:grid-cols-2">
          <label className="block"><span className="label">Employé</span>
            <select name="userId" className="input" required defaultValue={userId ? String(userId) : undefined}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <label className="block"><span className="label">Type</span>
            <select name="kind" className="input">{Object.entries(ABSENCE_KIND).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
          </label>
          <label className="block"><span className="label">Du</span><input name="start" type="date" className="input" required /></label>
          <label className="block"><span className="label">Au</span><input name="end" type="date" className="input" required /></label>
          <label className="block md:col-span-2"><span className="label">Motif</span><input name="reason" className="input" placeholder="ex. Certificat médical" required /></label>
          <button className="btn-primary md:col-span-2">Enregistrer l'absence</button>
        </form>
      </details>
    </SectionCard>
  );
}

async function Corrections({ people, userId }: { people: Person[]; userId?: number }) {
  const events = await db.select({
    id: schema.attendancePunchEvents.id,
    reason: schema.attendancePunchEvents.reason,
    createdAt: schema.attendancePunchEvents.createdAt,
    actor: schema.users.name,
  }).from(schema.attendancePunchEvents).leftJoin(schema.users, eq(schema.users.id, schema.attendancePunchEvents.actorId))
    .where(eq(schema.attendancePunchEvents.action, "corrige")).orderBy(desc(schema.attendancePunchEvents.createdAt)).limit(6);
  return (
    <SectionCard id="correction" title="Corriger un oubli de pointage" className="h-fit">
      <form action={manualPunch} className="grid gap-3 md:grid-cols-2">
        <label className="block"><span className="label">Employé</span>
          <select name="userId" className="input" required defaultValue={userId ? String(userId) : undefined}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="block"><span className="label">Pointage</span>
          <select name="kind" className="input"><option value="arrivee">Arrivée</option><option value="depart">Départ</option></select>
        </label>
        <label className="block"><span className="label">Date</span><input name="day" type="date" className="input" required /></label>
        <label className="block"><span className="label">Heure</span><input name="time" type="time" className="input" required /></label>
        <label className="block md:col-span-2"><span className="label">Motif</span><input name="note" className="input" placeholder="Obligatoire, ex. oubli de badge au départ" required /></label>
        <button className="btn-primary md:col-span-2"><PenLine size={16} /> Enregistrer la correction</button>
      </form>
      {events.length > 0 && (
        <div className="mt-4 border-t border-navy-100/70 pt-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy-600/60"><TimerReset size={13} /> Dernières corrections</p>
          <ul className="space-y-1 text-sm text-navy-600">
            {events.map((event) => <li key={event.id}>{formatDjiboutiDate(event.createdAt.toISOString().slice(0, 10))} {formatDjiboutiTime(event.createdAt)} · {event.actor ?? "—"} · {event.reason}</li>)}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

/* ─────────────────────────── À valider ─────────────────────────── */

async function Queue() {
  const rows = await reviewQueue();
  const requests = await db.select({
    id: schema.attendanceDeviceRequests.id,
    name: schema.users.name,
    color: schema.users.color,
    createdAt: schema.attendanceDeviceRequests.createdAt,
  }).from(schema.attendanceDeviceRequests).innerJoin(schema.users, eq(schema.users.id, schema.attendanceDeviceRequests.userId))
    .where(eq(schema.attendanceDeviceRequests.status, "pending")).orderBy(asc(schema.attendanceDeviceRequests.createdAt));
  const ids = [...new Set(rows.map((r) => Number(r.user_id)))];
  const colors = ids.length ? new Map((await db.select({ id: schema.users.id, color: schema.users.color }).from(schema.users).where(inArray(schema.users.id, ids))).map((u) => [u.id, u.color])) : new Map<number, string>();
  return (
    <div className="space-y-6">
      <form action={reviewMany}>
        <SectionCard title={`Pointages à vérifier et missions (${rows.length})`} flush>
          {rows.length === 0 ? <Empty title="Rien en attente">Tous les pointages sont traités.</Empty> : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th className="w-10"></th><th>Employé</th><th>Quand</th><th>Type</th><th>Détail</th></tr></thead>
                  <tbody>
                    {rows.map((row) => {
                      const lat = Number(row.lat);
                      const lng = Number(row.lng);
                      const link = row.task_title || row.project_title || row.slip_number || row.site_name || "";
                      return (
                        <tr key={String(row.id)}>
                          <td><input type="checkbox" name="id" value={String(row.id)} className="h-4 w-4 accent-[#2C3E50]" aria-label={`Sélectionner ${String(row.name)}`} /></td>
                          <td>
                            <span className="flex items-center gap-2.5">
                              <Avatar name={String(row.name)} color={colors.get(Number(row.user_id))} size={28} />
                              <span className="font-bold text-navy">{String(row.name)}</span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap tabular-nums">{formatDjiboutiDate(String(row.day).slice(0, 10))} · {formatDjiboutiTime(new Date(String(row.punched_at)))}</td>
                          <td>
                            <span className="font-bold">{row.kind === "depart" ? "Départ" : "Arrivée"}</span>
                            <span className={`ml-2 ${row.status === "mission" ? "badge-blue" : "badge-gold"}`}>{STATUS_LABEL[String(row.status)] ?? String(row.status)}</span>
                          </td>
                          <td className="text-sm">
                            {link && <p className="font-bold text-navy">{String(link)}</p>}
                            <p className="text-navy-600/80">
                              {[row.distance_m != null ? `${row.distance_m} m du bureau` : "", row.ip ? `réseau ${row.ip}` : "", reasonLabel(String(row.reason_codes ?? ""))].filter(Boolean).join(" · ")}
                            </p>
                            {Number.isFinite(lat) && Number.isFinite(lng) && row.lat != null && (
                              <details className="mt-1">
                                <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-navy-700"><MapPin size={13} /> Voir la position</summary>
                                <iframe title="Carte" className="mt-2 h-40 w-full rounded-xl border-0" src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01}%2C${lat - 0.01}%2C${lng + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`} />
                              </details>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-gold/20 px-5 py-4 sm:px-6">
                <span className="text-sm text-navy-600/75">Coche les lignes puis :</span>
                <button name="decision" value="valide" className="btn-primary">Valider la sélection</button>
                <input name="note" className="input max-w-xs" placeholder="Motif si refus" />
                <button name="decision" value="refuse" className="btn-danger">Refuser</button>
              </div>
            </>
          )}
        </SectionCard>
      </form>
      <SectionCard title={`Nouveaux téléphones (${requests.length})`}>
        {requests.length === 0 ? <p className="text-sm text-navy-600/70">Aucune demande.</p> : (
          <ul className="divide-y divide-navy-100/70">
            {requests.map((request) => (
              <li key={request.id}>
                <form action={resolveDevice} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <input type="hidden" name="id" value={request.id} />
                  <span className="flex items-center gap-2.5">
                    <Avatar name={request.name} color={request.color} size={28} />
                    <span className="font-bold text-navy">{request.name}</span>
                    <span className="text-xs text-navy-600/70">demandé le {formatDjiboutiDate(request.createdAt.toISOString().slice(0, 10))}</span>
                  </span>
                  <span className="flex gap-2">
                    <button name="decision" value="valide" className="btn-primary btn-sm">Autoriser</button>
                    <button name="decision" value="refuse" className="btn-danger btn-sm">Refuser</button>
                  </span>
                </form>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

/* ─────────────────────────── Outils ─────────────────────────── */

async function siteNames() {
  const sites = await db.select({ id: schema.attendanceSites.id, name: schema.attendanceSites.name }).from(schema.attendanceSites);
  return new Map(sites.map((site) => [site.id, site.name]));
}

function PunchList({
  punches, sites, showMap = false,
}: {
  punches: {
    id: number; kind: string; channel: string; status: string; punchedAt: Date; day: string;
    lat: number | null; lng: number | null; distanceM: number | null; ip: string | null;
    reasonCodes: string; note: string | null; siteId: number | null;
  }[];
  sites: Map<number, string>;
  showMap?: boolean;
}) {
  if (!punches.length) return <p className="text-sm text-navy-600/70">Aucun pointage.</p>;
  const badge: Record<string, string> = { valide: "badge-green", a_verifier: "badge-gold", refuse: "badge-red", mission: "badge-blue" };
  return (
    <ul className="divide-y divide-navy-100/70">
      {punches.map((punch) => {
        const why = reasonLabel(punch.reasonCodes);
        const place = punch.channel === "mission" ? "Mission" : (punch.siteId ? sites.get(punch.siteId) ?? "Bureau" : "Bureau");
        const lat = Number(punch.lat);
        const lng = Number(punch.lng);
        const located = showMap && punch.lat != null && punch.lng != null && Number.isFinite(lat) && Number.isFinite(lng);
        return (
          <li key={punch.id} className="py-2.5">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-20 tabular-nums text-navy-600/70">{formatDjiboutiDate(String(punch.day).slice(0, 10)).slice(0, 5)}</span>
              <span className="w-12 font-bold tabular-nums text-navy">{formatDjiboutiTime(punch.punchedAt)}</span>
              <span className="font-bold text-navy">{punch.kind === "depart" ? "Départ" : "Arrivée"}</span>
              <span className={badge[punch.status] ?? "badge-gray"}>{STATUS_LABEL[punch.status] ?? punch.status}</span>
              <span className="text-navy-600/75">
                {place}
                {punch.distanceM != null ? ` · ${punch.distanceM} m` : ""}
                {punch.ip ? ` · réseau ${punch.ip}` : ""}
                {why ? ` · ${why}` : ""}
                {punch.note ? ` · ${punch.note}` : ""}
              </span>
            </p>
            {located && (
              <iframe title="Carte" className="mt-2 h-40 w-full rounded-xl border-0" src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01}%2C${lat - 0.01}%2C${lng + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
