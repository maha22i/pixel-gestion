import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { today } from "@/lib/format";

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
  return (
    <Link href="/suivi" className="card card-pad mb-6 block">
      <p className="h-section mb-2">Équipe</p>
      <p className="text-sm">{row.late} tâche(s) en retard · {row.review} en attente de validation · {row.ready} projet(s) à clôturer</p>
    </Link>
  );
}