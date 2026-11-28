import Link from "next/link";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { todayLive, LIVE_LABEL, LIVE_BADGE } from "@/lib/attendance/live";
import { formatHM, parseHM } from "@/lib/attendance/time";
import { Avatar } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";

/** Encart du tableau de bord : présence de l'équipe aujourd'hui, en direct. */
export async function PresenceToday() {
  const live = await todayLive();
  const { stats } = live;
  if (stats.total === 0) return null;
  const late = live.rows.filter((r) => r.row.lateMin > 0);
  const missing = live.rows.filter((r) => r.live === "non_pointe" || r.live === "absent");
  const yesterdayHref = "/presences?date=" + new Date(Date.parse(`${live.realToday}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const pct = stats.total ? Math.round((stats.present / stats.total) * 100) : 0;
  const restDay = live.rows.every((r) => r.live === "repos" || r.live === "ferie");

  const tile = (label: string, value: number, tone: string) => (
    <div className="rounded-xl bg-navy-50/60 px-3 py-2.5">
      <p className={`text-2xl font-bold leading-none tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-navy-600/65">{label}</p>
    </div>
  );

  return (
    <section className="card card-pad mb-6">
      <AutoRefresh seconds={60} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-navy">
          <CalendarCheck size={18} className="text-gold-600" /> Présences aujourd'hui
        </h2>
        <span className="flex items-center gap-4">
          <Link href={yesterdayHref} className="text-sm font-semibold text-navy-600 hover:text-navy">Hier</Link>
          <Link href="/presences" className="link inline-flex items-center gap-1 text-sm">Voir le détail <ArrowRight size={14} /></Link>
        </span>
      </div>

      {restDay ? (
        <p className="text-sm text-navy-600/75">{live.holiday ? `Jour férié : ${live.holiday}.` : "Jour de repos selon l'horaire."}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <div className="mb-3 flex items-end justify-between gap-2">
              <p className="text-sm text-navy-600/75">
                <span className="text-3xl font-bold tabular-nums text-navy">{stats.present}</span>
                <span className="font-bold text-navy-600/60"> / {stats.total}</span> présents
              </p>
              <p className="text-sm text-navy-600/75">{formatHM(stats.workedMin)} travaillées</p>
            </div>
            <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-navy-50">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {tile("Au bureau", stats.onSite, "text-emerald-700")}
              {tile("En retard", stats.late, stats.late ? "text-red-700" : "text-navy")}
              {tile(live.clock.minutes < parseHM(live.schedule.endTime) ? "Non pointés" : "Absents", stats.notYet + stats.absent, stats.notYet + stats.absent ? "text-amber-700" : "text-navy")}
              {tile("À valider", stats.mission + stats.pending, "text-sky-800")}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <PeopleList title="En retard" empty="Personne en retard" rows={late.map((r) => ({ id: r.person.id, name: r.person.name, color: r.person.color, note: `${r.row.arrival} · +${r.row.lateMin} min`, badge: "badge-red" }))} />
            <PeopleList title="Pas là" empty="Toute l'équipe a pointé" rows={missing.map((r) => ({ id: r.person.id, name: r.person.name, color: r.person.color, note: LIVE_LABEL[r.live], badge: LIVE_BADGE[r.live] }))} />
          </div>
        </div>
      )}
    </section>
  );
}

function PeopleList({ title, empty, rows }: { title: string; empty: string; rows: { id: number; name: string; color: string; note: string; badge: string }[] }) {
  return (
    <div className="rounded-xl border border-navy-100/80 p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-navy-600/65">{title} ({rows.length})</p>
      {rows.length === 0 ? <p className="text-sm text-emerald-700">{empty}</p> : (
        <ul className="space-y-2">
          {rows.slice(0, 4).map((r) => (
            <li key={r.id}>
              <Link href={`/presences?employe=${r.id}#detail`} className="flex items-center gap-2 rounded-lg hover:bg-navy-50/60">
                <Avatar name={r.name} color={r.color} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy">{r.name}</span>
                <span className="shrink-0 text-xs text-navy-600/75">{r.note}</span>
              </Link>
            </li>
          ))}
          {rows.length > 4 && <li className="text-xs text-navy-600/70">+ {rows.length - 4} autre(s)</li>}
        </ul>
      )}
    </div>
  );
}
