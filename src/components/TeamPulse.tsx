import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { today } from "@/lib/format";
import { AlarmClock, ArrowRight, CheckCheck, FolderCheck } from "lucide-react";

export async function TeamPulse() {
  const day = today();
  const row = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM tasks WHERE due_date < ${day}::date AND status NOT IN ('termine','annule'))::int AS late,
      (SELECT COUNT(*) FROM tasks WHERE status = 'en_revue')::int AS review,
      (SELECT COUNT(*) FROM projects p WHERE p.status NOT IN ('livre','publie','cloture','annule')
        AND (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status <> 'annule') > 0
        AND (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status <> 'annule')
          = (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'termine'))::int AS ready
  `)).rows[0] as any;
  const items = [
    { label: "Tâches en retard", value: row.late, icon: AlarmClock, tone: row.late ? "text-red-700 bg-red-50" : "text-navy-700 bg-navy-50" },
    { label: "À valider", value: row.review, icon: CheckCheck, tone: row.review ? "text-amber-800 bg-gold-100" : "text-navy-700 bg-navy-50" },
    { label: "Projets à clôturer", value: row.ready, icon: FolderCheck, tone: row.ready ? "text-emerald-700 bg-emerald-50" : "text-navy-700 bg-navy-50" },
  ];
  return (
    <section className="card mb-6">
      <div className="flex items-center justify-between px-5 pb-1 pt-5 sm:px-6">
        <h2 className="h-section">Équipe & projets</h2>
        <Link href="/suivi" className="link inline-flex items-center gap-1 text-sm">Suivi de l'équipe <ArrowRight size={14} /></Link>
      </div>
      <div className="grid gap-3 p-5 pt-3 sm:grid-cols-3 sm:px-6">
        {items.map(({ label, value, icon: Icon, tone }) => (
          <Link key={label} href="/suivi" className="flex items-center gap-3 rounded-xl border border-navy-100/80 px-4 py-3 transition hover:border-gold/50 hover:bg-gold/5">
            <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}><Icon size={17} /></span>
            <span>
              <span className="block text-xl font-bold leading-none tabular-nums text-navy">{value}</span>
              <span className="mt-1 block text-xs font-bold text-navy-600/70">{label}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
