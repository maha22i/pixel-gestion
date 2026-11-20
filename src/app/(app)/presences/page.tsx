import Link from "next/link";
import { headers } from "next/headers";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { punchesBetween, ensureAttendanceAlerts } from "@/lib/attendance/alerts";
import { clientIpFromHeaders, normalizeIp } from "@/lib/attendance/ip";
import { ABSENCE_KIND, reasonLabel, STATUS_LABEL } from "@/lib/attendance/labels";
import { monthReport, openDepartures, reviewQueue, todayBoard } from "@/lib/attendance/report";
import { daysOfMonth, djiboutiClock, formatDjiboutiDate, formatDjiboutiTime } from "@/lib/attendance/time";
import { deleteAbsence, manualPunch, resolveDevice, reviewMany, saveAbsence } from "./actions";
import { IpUpdate } from "./IpUpdate";

export const dynamic = "force-dynamic";

export default async function PresencesPage({ searchParams }: { searchParams: { vue?: string; mois?: string; employe?: string; ok?: string; e?: string } }) {
  await requirePerm("presences", "write");
  await ensureAttendanceAlerts();
  const clock = djiboutiClock();
  const vue = searchParams.vue === "mois" || searchParams.vue === "valider" ? searchParams.vue : "jour";
  const month = /^\d{4}-\d{2}$/.test(searchParams.mois ?? "") ? searchParams.mois! : clock.day.slice(0, 7);
  const people = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  const employeeId = Number(searchParams.employe) || people[0]?.id || 0;
  const ip = normalizeIp(clientIpFromHeaders(headers()));
  const knownIps = await db.select({ ip: schema.attendanceSiteIps.ip }).from(schema.attendanceSiteIps);
  const ipKnown = !!ip && knownIps.some((row) => normalizeIp(row.ip) === ip);
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

  return (
    <>
      <PageHeader
        title="Présences"
        subtitle="Aujourd'hui, validation et export de paie"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className={vue === "jour" ? "btn-primary" : "btn-ghost"} href="/presences?vue=jour">Aujourd'hui</Link>
            <Link className={vue === "mois" ? "btn-primary" : "btn-ghost"} href={`/presences?vue=mois&mois=${month}&employe=${employeeId}`}>Mois</Link>
            <Link className={vue === "valider" ? "btn-primary" : "btn-ghost"} href="/presences?vue=valider">À valider</Link>
          </div>
        }
      />
      <Flash message={searchParams.ok ? messages[searchParams.ok] : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e ? errors[searchParams.e] : ""} clear={["e"]} />
      <IpUpdate known={ipKnown} ip={ip} />
      {vue === "jour" && <Today employeeId={Number(searchParams.employe) || 0} month={month} />}
      {vue === "mois" && <Month month={month} employeeId={employeeId} people={people} />}
      {vue === "valider" && <Queue />}
    </>
  );
}

async function Today({ employeeId, month }: { employeeId: number; month: string }) {
  const board = await todayBoard();
  const sites = await siteNames();
  const selected = board.rows.find((row) => row.person.id === employeeId) ?? null;
  const forgotten = await openDepartures(board.today);
  const present = board.rows.filter((r) => r.row.status === "present" || r.row.status === "mission" || r.row.status === "attente");
  const late = board.rows.filter((r) => r.row.lateMin > 0);
  const absent = board.rows.filter((r) => r.row.status === "absent");
  const mission = board.rows.filter((r) => r.row.status === "mission");
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Présents" value={present.length} />
        <Tile label="Retards" value={late.length} />
        <Tile label="Absents" value={absent.length} />
        <Tile label="En mission" value={mission.length} />
      </div>
      {board.holiday && <p className="rounded-xl bg-gold/15 px-4 py-2 font-bold text-navy">Jour férié : {board.holiday}</p>}
      {selected && (
        <section id="detail" className="card card-pad space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="h-section">Détail</p>
              <h2 className="text-xl font-bold text-navy">{selected.person.name}</h2>
              <p className="text-sm text-navy-600">{selected.row.arrival} → {selected.row.departure} · {selected.row.statusLabel}{selected.row.detail ? ` · ${selected.row.detail}` : ""}</p>
            </div>
            <span className="flex gap-2">
              <Link className="btn-ghost" href={`/presences?vue=mois&mois=${month}&employe=${selected.person.id}`}>Voir le mois</Link>
              <Link className="btn-ghost" href="/presences?vue=jour">Fermer</Link>
            </span>
          </div>
          <PunchList punches={selected.punches} sites={sites} showMap />
        </section>
      )}
      <p className="text-sm text-navy-600">Clique un employé pour voir ses pointages du jour.</p>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Employé</th><th>Arrivée</th><th>Départ</th><th>Statut</th><th>Retard</th><th>Détail</th></tr></thead>
          <tbody>
            {board.rows.map(({ person, row }) => (
              <tr key={person.id} className={person.id === employeeId ? "bg-gold/15" : undefined}>
                <td><Link className="font-bold text-navy hover:underline" href={`/presences?vue=jour&employe=${person.id}#detail`}>{person.name}</Link></td>
                <td>{row.arrival}</td>
                <td>{row.departure}</td>
                <td>{row.statusLabel}</td>
                <td>{row.lateMin ? `${row.lateMin} min` : "—"}</td>
                <td>{row.detail || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {forgotten.length > 0 && (
        <section className="card card-pad">
          <p className="h-section mb-2">Départs oubliés</p>
          {forgotten.map((row) => (
            <p key={row.id} className="text-sm">{row.name} · {formatDjiboutiDate(String(row.day).slice(0, 10))} · arrivée à {formatDjiboutiTime(new Date(row.punched_at))}. À corriger ci-dessous.</p>
          ))}
        </section>
      )}
      <Corrections />
    </div>
  );
}

async function Month({ month, employeeId, people }: { month: string; employeeId: number; people: { id: number; name: string }[] }) {
  const report = employeeId ? await monthReport(employeeId, month) : null;
  const days = daysOfMonth(month);
  const punches = employeeId ? await punchesBetween(employeeId, days[0], days[days.length - 1]) : [];
  const sites = await siteNames();
  const absences = await db.select().from(schema.attendanceAbsences).orderBy(desc(schema.attendanceAbsences.startDate)).limit(40);
  const names = new Map(people.map((p) => [p.id, p.name]));
  return (
    <div className="space-y-6">
      <form className="flex flex-wrap gap-2" action="/presences" method="get">
        <input type="hidden" name="vue" value="mois" />
        <input className="input w-auto" type="month" name="mois" defaultValue={month} />
        <select className="input w-auto" name="employe" defaultValue={String(employeeId)}>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-primary">Afficher</button>
        {report && <a className="btn-ghost" href={`/api/presences/export?mois=${month}&user=${employeeId}&format=pdf`}>PDF</a>}
        {report && <a className="btn-ghost" href={`/api/presences/export?mois=${month}&user=${employeeId}&format=xlsx`}>Excel</a>}
        <a className="btn-gold" href={`/api/presences/export?mois=${month}&format=xlsx`}>Excel tous les employés</a>
      </form>
      {report?.person && (
        <div className="card overflow-x-auto">
          <p className="h-section px-5 pt-5">{report.person.name} · {month}</p>
          <table className="table">
            <thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th>Heures</th><th>Retard</th><th>Statut</th><th>Détail</th></tr></thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.day}>
                  <td>{formatDjiboutiDate(row.day)}</td>
                  <td>{row.arrival}</td>
                  <td>{row.departure}</td>
                  <td>{row.hoursLabel}</td>
                  <td>{row.lateMin ? `${row.lateMin} min` : "—"}</td>
                  <td>{row.statusLabel}</td>
                  <td>{row.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-4 font-bold text-navy">
            Heures {report.totals.hoursLabel} · {report.totals.daysWorked} jours travaillés · {report.totals.lateMin} min de retard · {report.totals.absences} absences non justifiées
          </p>
        </div>
      )}
      {report?.person && (
        <section className="card card-pad space-y-3">
          <p className="h-section">Pointages de {report.person.name}</p>
          <PunchList punches={punches} sites={sites} />
        </section>
      )}
      <section className="card card-pad space-y-3">
        <p className="h-section">Absence justifiée</p>
        <form action={saveAbsence} className="grid gap-3 md:grid-cols-2">
          <select name="userId" className="input" required>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select name="kind" className="input">{Object.entries(ABSENCE_KIND).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
          <input name="start" type="date" className="input" required />
          <input name="end" type="date" className="input" required />
          <input name="reason" className="input md:col-span-2" placeholder="Motif" required />
          <button className="btn-primary md:col-span-2">Enregistrer l'absence</button>
        </form>
        <ul className="divide-y divide-navy/5 text-sm">
          {absences.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <span><span className="font-bold">{names.get(a.userId) ?? a.userId}</span> · {ABSENCE_KIND[a.kind] ?? a.kind} · {formatDjiboutiDate(a.startDate)} → {formatDjiboutiDate(a.endDate)} · {a.reason}</span>
              <form action={deleteAbsence}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="userId" value={employeeId} />
                <input type="hidden" name="mois" value={month} />
                <button className="btn-ghost btn-sm">Retirer</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
      <Corrections people={people} />
    </div>
  );
}

async function Queue() {
  const rows = await reviewQueue();
  const requests = await db.select({
    id: schema.attendanceDeviceRequests.id,
    name: schema.users.name,
    createdAt: schema.attendanceDeviceRequests.createdAt,
  }).from(schema.attendanceDeviceRequests).innerJoin(schema.users, eq(schema.users.id, schema.attendanceDeviceRequests.userId))
    .where(eq(schema.attendanceDeviceRequests.status, "pending")).orderBy(asc(schema.attendanceDeviceRequests.createdAt));
  return (
    <div className="space-y-6">
      <form action={reviewMany} className="card overflow-x-auto">
        <p className="h-section px-5 pt-5">Pointages à vérifier et missions</p>
        {rows.length === 0 ? <p className="px-5 py-6 text-sm text-navy-600">Rien en attente.</p> : (
          <table className="table">
            <thead><tr><th></th><th>Employé</th><th>Quand</th><th>Type</th><th>Détail</th><th></th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const lat = Number(row.lat);
                const lng = Number(row.lng);
                const link = row.task_title || row.project_title || row.slip_number || row.site_name || "";
                return (
                  <tr key={String(row.id)}>
                    <td><input type="checkbox" name="id" value={String(row.id)} /></td>
                    <td className="font-bold">{String(row.name)}</td>
                    <td>{formatDjiboutiDate(String(row.day).slice(0, 10))} {formatDjiboutiTime(new Date(String(row.punched_at)))}</td>
                    <td>{row.kind === "depart" ? "Départ" : "Arrivée"} · {STATUS_LABEL[String(row.status)] ?? String(row.status)}</td>
                    <td>
                      <p>{String(link)} {row.distance_m != null ? `· ${row.distance_m} m` : ""} {row.ip ? `· ${row.ip}` : ""}</p>
                      <p>{reasonLabel(String(row.reason_codes ?? ""))}</p>
                      {Number.isFinite(lat) && Number.isFinite(lng) && row.lat != null && (
                        <iframe title="Carte" className="mt-2 h-40 w-full rounded-xl border-0" src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01}%2C${lat - 0.01}%2C${lng + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`} />
                      )}
                    </td>
                    <td className="text-sm text-navy-600">Coche pour valider ou refuser</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 py-4">
            <input name="note" className="input max-w-sm" placeholder="Motif si refus" />
            <button name="decision" value="valide" className="btn-primary">Valider la sélection</button>
            <button name="decision" value="refuse" className="btn-danger">Refuser la sélection</button>
          </div>
        )}
      </form>
      <section className="card card-pad space-y-2">
        <p className="h-section">Nouveaux téléphones</p>
        {requests.length === 0 ? <p className="text-sm text-navy-600">Aucune demande.</p> : requests.map((request) => (
          <form key={request.id} action={resolveDevice} className="flex flex-wrap items-center justify-between gap-2">
            <input type="hidden" name="id" value={request.id} />
            <span className="font-bold">{request.name}</span>
            <span className="flex gap-2">
              <button name="decision" value="valide" className="btn-primary btn-sm">Autoriser</button>
              <button name="decision" value="refuse" className="btn-danger btn-sm">Refuser</button>
            </span>
          </form>
        ))}
      </section>
    </div>
  );
}

async function Corrections({ people }: { people?: { id: number; name: string }[] }) {
  const list = people ?? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  const events = await db.select({
    id: schema.attendancePunchEvents.id,
    action: schema.attendancePunchEvents.action,
    reason: schema.attendancePunchEvents.reason,
    createdAt: schema.attendancePunchEvents.createdAt,
    actor: schema.users.name,
  }).from(schema.attendancePunchEvents).leftJoin(schema.users, eq(schema.users.id, schema.attendancePunchEvents.actorId))
    .where(eq(schema.attendancePunchEvents.action, "corrige")).orderBy(desc(schema.attendancePunchEvents.createdAt)).limit(12);
  return (
    <section className="card card-pad space-y-3">
      <p className="h-section">Correction d'un oubli</p>
      <form action={manualPunch} className="grid gap-3 md:grid-cols-2">
        <select name="userId" className="input" required>{list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="kind" className="input"><option value="arrivee">Arrivée</option><option value="depart">Départ</option></select>
        <input name="day" type="date" className="input" required />
        <input name="time" type="time" className="input" required />
        <input name="note" className="input md:col-span-2" placeholder="Motif obligatoire" required />
        <button className="btn-primary md:col-span-2">Enregistrer la correction</button>
      </form>
      {events.length > 0 && (
        <ul className="text-sm text-navy-600">
          {events.map((event) => <li key={event.id}>{formatDjiboutiTime(event.createdAt)} · {event.actor ?? "—"} · {event.reason}</li>)}
        </ul>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card card-pad"><p className="h-section">{label}</p><p className="mt-2 text-3xl font-bold text-navy">{value}</p></div>;
}

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
  if (!punches.length) return <p className="text-sm text-navy-600">Aucun pointage.</p>;
  return (
    <ul className="divide-y divide-navy/5">
      {punches.map((punch) => {
        const why = reasonLabel(punch.reasonCodes);
        const place = punch.channel === "mission" ? "Mission" : (punch.siteId ? sites.get(punch.siteId) ?? "Bureau" : "Bureau");
        const lat = Number(punch.lat);
        const lng = Number(punch.lng);
        const located = showMap && punch.lat != null && punch.lng != null && Number.isFinite(lat) && Number.isFinite(lng);
        return (
          <li key={punch.id} className="py-3">
            <p className="font-bold text-navy">
              {formatDjiboutiDate(String(punch.day).slice(0, 10))} · {formatDjiboutiTime(punch.punchedAt)} · {punch.kind === "depart" ? "Départ" : "Arrivée"} · {STATUS_LABEL[punch.status] ?? punch.status}
            </p>
            <p className="text-sm text-navy-600">
              {place}
              {punch.distanceM != null ? ` · ${punch.distanceM} m` : ""}
              {punch.ip ? ` · réseau ${punch.ip}` : ""}
              {why ? ` · ${why}` : ""}
              {punch.note ? ` · ${punch.note}` : ""}
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
