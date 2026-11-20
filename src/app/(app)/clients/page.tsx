import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { CLIENT_TYPES, fdj } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";

export default async function ClientsPage({ searchParams }: { searchParams: { q?: string; type?: string } }) {
  const user = await requirePerm("clients");
  const q = (searchParams.q ?? "").trim();
  const type = searchParams.type ?? "";
  const res = await db.execute(sql`
    SELECT c.*,
      (SELECT count(*) FROM projects p WHERE p.client_id = c.id)::int AS projects,
      COALESCE((SELECT SUM(total) FROM invoices i WHERE i.client_id = c.id AND i.status <> 'annulee'), 0)::int AS invoiced,
      COALESCE((SELECT SUM(pa.amount) FROM payments pa JOIN invoices i ON i.id = pa.invoice_id WHERE i.client_id = c.id AND i.status <> 'annulee'), 0)::int AS paid
    FROM clients c
    WHERE (${q} = '' OR c.name ILIKE ${"%" + q + "%"} OR c.contact_name ILIKE ${"%" + q + "%"} OR c.phone ILIKE ${"%" + q + "%"})
      AND (${type} = '' OR c.type = ${type})
    ORDER BY c.name`);
  const rows = res.rows as any[];
  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} client${rows.length > 1 ? "s" : ""}`}
        actions={can(user, "clients", "write") && <Link href="/clients/nouveau" className="btn-primary">+ Nouveau client</Link>}
      />
      <form className="flex flex-wrap gap-2 mb-4">
        <input name="q" defaultValue={q} placeholder="Rechercher un nom, contact, téléphone…" className="input max-w-sm" />
        <select name="type" defaultValue={type} className="input w-auto">
          <option value="">Tous les types</option>
          {Object.entries(CLIENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-ghost">Filtrer</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty title="Aucun client">Créez votre premier client pour commencer.</Empty> : (
          <table className="table">
            <thead><tr><th>Client</th><th>Type</th><th>Contact</th><th className="num">Projets</th><th className="num">Facturé</th><th className="num">Reste dû</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="clickable">
                  <td><Link href={`/clients/${c.id}`} className="link row-hit">{c.name}</Link></td>
                  <td><span className="badge-gray">{CLIENT_TYPES[c.type]}</span></td>
                  <td className="text-navy-600 text-sm">{[c.contact_name, c.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="num">{c.projects}</td>
                  <td className="num">{fdj(c.invoiced)}</td>
                  <td className={`num font-bold ${c.invoiced - c.paid > 0 ? "text-red-700" : "text-navy-600/50"}`}>{fdj(c.invoiced - c.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
