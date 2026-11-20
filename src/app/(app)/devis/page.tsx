import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { QUOTE_STATUS, dateFr, fdj } from "@/lib/format";
import { PageHeader, QuoteBadge, Empty } from "@/components/ui";

export default async function QuotesPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const user = await requirePerm("devis");
  const q = (searchParams.q ?? "").trim();
  const status = searchParams.status ?? "";
  const res = await db.execute(sql`
    SELECT qu.*, c.name AS client_name, p.title AS project_title,
      (SELECT id FROM invoices i WHERE i.quote_id = qu.id LIMIT 1) AS invoice_id
    FROM quotes qu JOIN clients c ON c.id = qu.client_id LEFT JOIN projects p ON p.id = qu.project_id
    WHERE (${q} = '' OR qu.number ILIKE ${"%" + q + "%"} OR qu.subject ILIKE ${"%" + q + "%"} OR c.name ILIKE ${"%" + q + "%"})
      AND (${status} = '' OR qu.status = ${status})
    ORDER BY qu.issue_date DESC, qu.id DESC`);
  const rows = res.rows as any[];
  const counts = await db.execute(sql`SELECT status, count(*)::int AS n, COALESCE(SUM(total),0)::bigint AS t FROM quotes GROUP BY status`);
  const by = Object.fromEntries((counts.rows as any[]).map((r) => [r.status, r]));
  return (
    <>
      <PageHeader
        title="Devis"
        subtitle="Numérotation automatique PN-AAAA-MMJJ-XXX"
        actions={can(user, "devis", "write") && <Link href="/devis/nouveau" className="btn-primary">+ Nouveau devis</Link>}
      />
      <div className="flex flex-wrap gap-2 mb-4">
        <Link href="/devis" className={!status ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Tous</Link>
        {Object.entries(QUOTE_STATUS).map(([k, v]) => (
          <Link key={k} href={`/devis?status=${k}`} className={status === k ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
            {v} <span className="opacity-60">{by[k]?.n ?? 0}</span>
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="N°, objet ou client…" className="input max-w-sm" />
        <button className="btn-ghost">Rechercher</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty title="Aucun devis" /> : (
          <table className="table">
            <thead><tr><th>N°</th><th>Client / objet</th><th>Date</th><th>Validité</th><th className="num">Montant</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="clickable">
                  <td><Link href={`/devis/${r.id}`} className="link row-hit whitespace-nowrap">{r.number}</Link></td>
                  <td><span className="font-bold">{r.client_name}</span><div className="text-sm text-navy-600/70">{r.subject}</div></td>
                  <td className="whitespace-nowrap">{dateFr(r.issue_date)}</td>
                  <td className="whitespace-nowrap">{dateFr(r.valid_until)}</td>
                  <td className="num font-bold">{fdj(r.total)}</td>
                  <td><QuoteBadge s={r.status} /></td>
                  <td>{r.invoice_id && <Link href={`/factures/${r.invoice_id}`} className="badge-navy">Facturé</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
