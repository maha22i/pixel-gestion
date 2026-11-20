import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requirePerm } from "@/lib/auth";
import { SLIP_STATUS } from "@/lib/equipmentLabels";
import { notifyOverdueSlips } from "@/lib/equipmentSlips";
import { dateFr } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";

export default async function SortiesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requirePerm("materiel");
  const write = can(user, "materiel", "write");
  await notifyOverdueSlips();
  const status = searchParams.status ?? "";
  const projet = searchParams.projet ?? "";
  const personne = searchParams.personne ?? "";
  const from = searchParams.from ?? "";
  const to = searchParams.to ?? "";

  const res = await db.execute(sql`
    SELECT s.*, p.title AS project_title,
      (SELECT COUNT(*)::int FROM equipment_slip_items i WHERE i.slip_id = s.id) AS n_items,
      (SELECT string_agg(u.name, ', ' ORDER BY u.name)
         FROM equipment_slip_members m JOIN users u ON u.id = m.user_id WHERE m.slip_id = s.id) AS team,
      (s.status IN ('sorti', 'attente_controle') AND s.expected_return_at < now()) AS overdue
    FROM equipment_slips s
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE (${status} = '' OR s.status = ${status})
      AND (${projet} = '' OR s.project_id = ${Number(projet) || 0})
      AND (${personne} = '' OR EXISTS (
        SELECT 1 FROM equipment_slip_members m WHERE m.slip_id = s.id AND m.user_id = ${Number(personne) || 0}
      ))
      AND (${from} = '' OR s.out_at::date >= ${from || "1970-01-01"}::date)
      AND (${to} = '' OR s.out_at::date <= ${to || "2999-12-31"}::date)
      AND (
        ${write} = true
        OR EXISTS (SELECT 1 FROM equipment_slip_members m WHERE m.slip_id = s.id AND m.user_id = ${user.id})
      )
    ORDER BY s.out_at DESC, s.id DESC`);
  const rows = res.rows as Record<string, unknown>[];
  const projects = await db.select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects).orderBy(asc(schema.projects.title));
  const people = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));

  return (
    <>
      <PageHeader
        title="Sorties de matériel"
        subtitle="Bons de sortie et contrôle de retour."
        back={{ href: "/materiel", label: "Matériel" }}
        actions={write ? <Link className="btn-gold" href="/materiel/sorties/nouveau">Nouveau bon</Link> : undefined}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="status" defaultValue={status} className="input w-auto">
          <option value="">Tous les statuts</option>
          {Object.entries(SLIP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="projet" defaultValue={projet} className="input w-auto">
          <option value="">Tous les projets</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <select name="personne" defaultValue={personne} className="input w-auto">
          <option value="">Toute l'équipe</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" name="from" defaultValue={from} className="input w-auto" />
        <input type="date" name="to" defaultValue={to} className="input w-auto" />
        <button className="btn-navy">Filtrer</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty title="Aucun bon de sortie" /> : (
          <table className="table">
            <thead>
              <tr><th>N°</th><th>Projet</th><th>Équipe</th><th>Sortie</th><th>Retour prévu</th><th>Articles</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="clickable">
                  <td><a className="row-hit font-mono font-bold" href={`/materiel/sorties/${r.id}`}>{String(r.number)}</a></td>
                  <td>{String(r.project_title ?? r.off_project_reason ?? "—")}</td>
                  <td className="text-sm">{String(r.team ?? "—")}</td>
                  <td>{dateFr(String(r.out_at).slice(0, 10))}</td>
                  <td>
                    {dateFr(String(r.expected_return_at).slice(0, 10))}
                    {r.overdue ? <span className="badge ml-1 bg-red-600 text-white">En retard</span> : null}
                  </td>
                  <td>{String(r.n_items)}</td>
                  <td><span className={r.status === "cloture_anomalies" ? "badge-red" : r.status === "attente_controle" ? "badge-gold" : r.status === "sorti" ? "badge-navy" : "badge-gray"}>{SLIP_STATUS[String(r.status)] ?? String(r.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
