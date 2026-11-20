import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requirePerm, can, canFinance } from "@/lib/auth";
import { PROJECT_STATUS, PROJECT_TYPES, dateFr, fdj, today } from "@/lib/format";
import { PageHeader, ProjectBadge, Empty } from "@/components/ui";

export default async function ProjectsPage({ searchParams }: { searchParams: { q?: string; type?: string; status?: string; nature?: string; late?: string } }) {
  const user = await requirePerm("projets");
  const finance = canFinance(user);
  const q = (searchParams.q ?? "").trim();
  const type = searchParams.type ?? "";
  const status = searchParams.status ?? "";
  const nature = searchParams.nature ?? "";
  const late = searchParams.late === "1";
  const day = today();
  const res = await db.execute(sql`
    SELECT p.*, c.name AS client_name, u.name AS owner_name,
      COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status <> 'annule'), 0)::int AS task_total,
      COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'termine'), 0)::int AS task_done,
      COALESCE((SELECT SUM(total) FROM invoices i WHERE i.project_id = p.id AND i.status <> 'annulee'), 0)::int AS invoiced,
      COALESCE((SELECT SUM(pa.amount) FROM payments pa JOIN invoices i ON i.id = pa.invoice_id WHERE i.project_id = p.id AND i.status <> 'annulee'), 0)::int AS paid,
      (SELECT string_agg(et.name, ', ' ORDER BY et.position) FROM project_event_types pet JOIN event_types et ON et.id = pet.event_type_id WHERE pet.project_id = p.id) AS events
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN users u ON u.id = p.owner_id
    WHERE (${q} = '' OR p.title ILIKE ${"%" + q + "%"} OR c.name ILIKE ${"%" + q + "%"})
      AND (${type} = '' OR p.type = ${type})
      AND (${status} = '' OR p.status = ${status})
      AND (${nature} = '' OR p.nature = ${nature})
      AND (${late} = false OR (p.end_date IS NOT NULL AND p.end_date < ${day}::date AND p.status NOT IN ('livre','publie','cloture','annule')))
      AND (${user.role} = 'admin' OR p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${user.id}))
    ORDER BY COALESCE(p.start_date, p.created_at::date) DESC, p.id DESC`);
  const rows = res.rows as any[];
  const admin = user.role === "admin";
  return (
    <>
      <PageHeader
        title="Projets"
        subtitle={`${rows.length} projet${rows.length > 1 ? "s" : ""}`}
        actions={can(user, "projets", "write") && <Link href="/projets/nouveau" className="btn-primary">+ Nouveau projet</Link>}
      />
      {admin && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Link href="/projets" className={!type ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Tous</Link>
          {Object.entries(PROJECT_TYPES).map(([k, v]) => (
            <Link key={k} href={`/projets?type=${k}`} className={type === k ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{v}</Link>
          ))}
        </div>
      )}
      <form className="flex flex-wrap gap-2 mb-4">
        {admin && type && <input type="hidden" name="type" value={type} />}
        <input name="q" defaultValue={q} placeholder="Rechercher un projet…" className="input max-w-sm" />
        {admin && (
          <>
            <select name="nature" defaultValue={nature} className="input w-auto">
              <option value="">Client et interne</option>
              <option value="client">Projet client</option>
              <option value="interne">Projet interne</option>
            </select>
            <select name="status" defaultValue={status} className="input w-auto">
              <option value="">Tous les statuts</option>
              {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="late" value="1" defaultChecked={late} /> En retard</label>
          </>
        )}
        <button className="btn-ghost">Filtrer</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty title="Aucun projet" /> : (
          <table className="table">
            <thead><tr><th>Projet</th><th>Client</th><th>Type</th><th>Échéance</th><th>Avancement</th><th>Statut</th>{finance && <><th className="num">Facturé</th><th className="num">Reste dû</th></>}</tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="clickable">
                  <td>
                    <Link href={`/projets/${p.id}`} className="link row-hit">{p.title}</Link>
                    {p.events && <div className="text-sm text-navy-600/70">{p.events}</div>}
                  </td>
                  <td className="text-navy-600">{p.nature === "interne" ? "Pixel Nomade" : (p.client_name ?? "—")}</td>
                  <td><span className={p.type === "mariage" ? "badge-gold" : "badge-gray"}>{p.nature === "interne" ? "Interne" : PROJECT_TYPES[p.type]}</span></td>
                  <td className="whitespace-nowrap">{dateFr(p.end_date)}{p.end_date && p.end_date < day && !["livre","publie","cloture","annule"].includes(p.status) && <div className="text-red-700 text-xs font-bold">En retard</div>}{p.owner_name && <div className="text-xs text-navy-600/70">{p.owner_name}</div>}</td>
                  <td>{p.task_total ? `${Math.round((p.task_done / p.task_total) * 100)} %` : "—"}</td>
                  <td><ProjectBadge s={p.status} /></td>
                  {finance && p.nature !== "interne" && <><td className="num">{fdj(p.invoiced)}</td>
                  <td className={`num font-bold ${p.invoiced - p.paid > 0 ? "text-red-700" : "text-navy-600/50"}`}>{fdj(p.invoiced - p.paid)}</td></>}
                  {finance && p.nature === "interne" && <><td className="num text-navy-600/50">—</td><td className="num text-navy-600/50">—</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
