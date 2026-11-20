import Link from "next/link";
import { requirePerm, can } from "@/lib/auth";
import { invoicesFinance } from "@/lib/finance";
import { PAYMENT_STATUS, dateFr, fdj } from "@/lib/format";
import { PageHeader, PayBadge, Stat, Empty } from "@/components/ui";

export default async function InvoicesPage({ searchParams }: { searchParams: { q?: string; s?: string } }) {
  const user = await requirePerm("factures");
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const s = searchParams.s ?? "";
  const all = await invoicesFinance();
  const rows = all.filter((i) =>
    (!q || i.number.toLowerCase().includes(q) || i.subject.toLowerCase().includes(q) || i.clientName.toLowerCase().includes(q)) &&
    (!s || (s === "retard" ? i.overdue : s === "impayees" ? i.remaining > 0 : i.paymentStatus === s))
  );
  const live = all.filter((i) => i.status !== "annulee");
  const totalInvoiced = live.reduce((a, i) => a + i.total, 0);
  const totalPaid = live.reduce((a, i) => a + i.paid, 0);
  const overdue = live.filter((i) => i.overdue);
  const filters: [string, string][] = [["", "Toutes"], ["impayees", "Reste à payer"], ["retard", "En retard"], ...Object.entries(PAYMENT_STATUS)];
  return (
    <>
      <PageHeader
        title="Factures"
        subtitle="Numérotation automatique FAC-AAAA-MMJJ-XXX"
        actions={can(user, "factures", "write") && <Link href="/factures/nouveau" className="btn-ghost">+ Facture sans devis</Link>}
      />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Stat label="Total facturé" value={fdj(totalInvoiced)} />
        <Stat label="Total encaissé" value={fdj(totalPaid)} tone="green" />
        <Stat label="Reste à encaisser" value={fdj(totalInvoiced - totalPaid)} tone="red" />
        <Stat label="Factures en retard" value={overdue.length} hint={fdj(overdue.reduce((a, i) => a + i.remaining, 0))} tone={overdue.length ? "red" : "navy"} />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map(([k, v]) => (
          <Link key={k} href={k ? `/factures?s=${k}` : "/factures"} className={s === k ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{v}</Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        {s && <input type="hidden" name="s" value={s} />}
        <input name="q" defaultValue={searchParams.q} placeholder="N°, objet ou client…" className="input max-w-sm" />
        <button className="btn-ghost">Rechercher</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty title="Aucune facture">Convertissez un devis accepté en facture en un clic depuis sa fiche.</Empty> : (
          <table className="table">
            <thead><tr><th>N°</th><th>Client / objet</th><th>Date</th><th className="num">Total</th><th className="num">Payé</th><th className="num">Reste</th><th>Statut</th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={i.status === "annulee" ? "clickable opacity-50" : "clickable"}>
                  <td><Link href={`/factures/${i.id}`} className="link row-hit whitespace-nowrap">{i.number}</Link></td>
                  <td><span className="font-bold">{i.clientName}</span><div className="text-sm text-navy-600/70">{i.subject}</div></td>
                  <td className="whitespace-nowrap">{dateFr(i.issueDate)}</td>
                  <td className="num font-bold">{fdj(i.total)}</td>
                  <td className="num text-emerald-700">{fdj(i.paid)}</td>
                  <td className={`num font-bold ${i.remaining > 0 ? "text-red-700" : "text-navy-600/40"}`}>{fdj(i.remaining)}</td>
                  <td><PayBadge s={i.paymentStatus} overdue={i.overdue} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
