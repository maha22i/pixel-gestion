import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { invoicesFinance } from "@/lib/finance";
import { PAYMENT_METHODS, dateFr, fdj } from "@/lib/format";
import { PageHeader, PayBadge, Stat, Empty } from "@/components/ui";

export default async function PaymentsPage({ searchParams }: { searchParams: { m?: string; method?: string } }) {
  const user = await requirePerm("paiements");
  const now = new Date();
  const month = searchParams.m ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const method = searchParams.method ?? "";
  const res = await db.execute(sql`
    SELECT pa.*, i.number AS invoice_number, i.id AS invoice_id, c.name AS client_name
    FROM payments pa JOIN invoices i ON i.id = pa.invoice_id JOIN clients c ON c.id = i.client_id
    WHERE (${month} = 'tout' OR to_char(pa.date, 'YYYY-MM') = ${month})
      AND (${method} = '' OR pa.method = ${method})
    ORDER BY pa.date DESC, pa.id DESC`);
  const rows = res.rows as any[];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const byMethod = Object.keys(PAYMENT_METHODS).map((k) => [k, rows.filter((r) => r.method === k).reduce((s, r) => s + Number(r.amount), 0)] as const);
  const unpaid = can(user, "factures") ? (await invoicesFinance()).filter((i) => i.remaining > 0) : [];

  const months: string[] = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthLabel = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Paiements" subtitle="Tous les encaissements. Un paiement s'enregistre depuis la fiche de la facture." />
      <form className="flex flex-wrap gap-2 mb-4">
        <select name="m" defaultValue={month} className="input w-auto">
          <option value="tout">Toute la période</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <select name="method" defaultValue={method} className="input w-auto">
          <option value="">Tous les modes</option>
          {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-ghost">Filtrer</button>
      </form>
      <div className="grid sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
        <div className="xl:col-span-1 sm:col-span-2"><Stat label="Encaissé" value={fdj(total)} hint={`${rows.length} paiement${rows.length > 1 ? "s" : ""}`} tone="green" /></div>
        {byMethod.map(([k, v]) => (
          <div key={k} className="card card-pad">
            <p className="h-section">{PAYMENT_METHODS[k]}</p>
            <p className="mt-2 text-lg font-bold tabular-nums">{fdj(v)}</p>
          </div>
        ))}
      </div>
      <div className="grid xl:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="card overflow-x-auto">
          {rows.length === 0 ? <Empty title="Aucun paiement sur la période" /> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Reçu</th><th>Client / facture</th><th>Mode</th><th className="num">Montant</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable">
                    <td className="whitespace-nowrap">{dateFr(r.date)}</td>
                    <td><a href={`/api/pdf/recu/${r.id}`} target="_blank" className="link row-keep whitespace-nowrap">{r.receipt_number}</a></td>
                    <td><span className="font-bold">{r.client_name}</span><div className="text-sm"><Link href={`/factures/${r.invoice_id}`} className="link row-hit font-normal">{r.invoice_number}</Link></div></td>
                    <td>{PAYMENT_METHODS[r.method] ?? r.method}{r.reference && <div className="text-sm text-navy-600/70">{r.reference}</div>}{r.proof_stored && <div><a href={`/api/fichiers/paiement/${r.id}`} target="_blank" className="text-sm link row-keep font-normal">Justificatif</a></div>}</td>
                    <td className="num font-bold text-emerald-700">{fdj(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {can(user, "factures") && (
          <aside className="card">
            <p className="h-section px-5 pt-5 pb-2">À encaisser ({unpaid.length})</p>
            {unpaid.length === 0 ? <Empty title="Tout est encaissé" /> : (
              <ul className="divide-y divide-navy-50">
                {unpaid.map((i) => (
                  <li key={i.id} className="px-5 py-3 flex justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/factures/${i.id}`} className="link">{i.clientName}</Link>
                      <div className="text-sm text-navy-600/70">{i.number}</div>
                      <div className="mt-1"><PayBadge s={i.paymentStatus} overdue={i.overdue} /></div>
                    </div>
                    <b className="tabular-nums text-red-700 whitespace-nowrap">{fdj(i.remaining)}</b>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
