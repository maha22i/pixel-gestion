import Link from "next/link";
import { sql } from "drizzle-orm";
import { ArrowUpRight, FileText, HandCoins, Hourglass, Paperclip, Receipt, Wallet } from "lucide-react";
import { db } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { invoicesFinance } from "@/lib/finance";
import { PAYMENT_METHODS, dateFr, fdj } from "@/lib/format";
import { PageHeader, PayBadge, Stat, Empty, Progress } from "@/components/ui";
import { Breakdown, Delta, MonthNav, href, inMonth, monthLabel, parseMonth, shiftMonth } from "../depenses/finance-ui";
import { METHOD_COLOR } from "../depenses/colors";

const PATH = "/paiements";

export default async function PaymentsPage({ searchParams }: { searchParams: { m?: string; method?: string } }) {
  const user = await requirePerm("paiements");
  const seeInvoices = can(user, "factures");
  const payWrite = can(user, "paiements", "write");
  const month = parseMonth(searchParams.m);
  const method = searchParams.method && searchParams.method in PAYMENT_METHODS ? searchParams.method : "";
  const all = month === "tout";
  const prevMonth = all ? "" : shiftMonth(month, -1);

  const res = await db.execute(sql`
    SELECT pa.*, i.number AS invoice_number, i.id AS invoice_id, c.name AS client_name
    FROM payments pa JOIN invoices i ON i.id = pa.invoice_id JOIN clients c ON c.id = i.client_id
    WHERE (${month} = 'tout' OR to_char(pa.date, 'YYYY-MM') = ${month})
    ORDER BY pa.date DESC, pa.id DESC`);
  const periodRows = res.rows as any[];
  const rows = method ? periodRows.filter((r) => r.method === method) : periodRows;
  const sum = (list: any[]) => list.reduce((s, r) => s + Number(r.amount), 0);
  const total = sum(rows);
  const n = rows.length;

  const prev = all ? null : ((await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::bigint AS total, COUNT(*)::int AS n FROM payments
    WHERE to_char(date, 'YYYY-MM') = ${prevMonth} AND (${method} = '' OR method = ${method})`)).rows[0] as { total: string; n: number });
  const prevTotal = Number(prev?.total ?? 0);

  const slices = Object.entries(PAYMENT_METHODS)
    .map(([k, label]) => {
      const list = periodRows.filter((r) => r.method === k);
      return { key: k, label, amount: sum(list), count: list.length, color: METHOD_COLOR[k] ?? "bg-navy-200", href: href(PATH, { m: month, method: k }) };
    })
    .sort((a, b) => b.amount - a.amount);

  // À encaisser : factures avec un reste à payer, les retards d'abord puis les plus gros montants.
  const unpaid = seeInvoices
    ? (await invoicesFinance())
        .filter((i) => i.remaining > 0)
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.remaining - a.remaining)
    : [];
  const unpaidTotal = unpaid.reduce((s, i) => s + i.remaining, 0);
  const overdue = unpaid.filter((i) => i.overdue);
  const methodLabel = method ? PAYMENT_METHODS[method] : "";

  const receipt = (r: any) => (
    <div className="flex items-center gap-1">
      <a href={`/api/pdf/recu/${r.id}`} target="_blank" className="row-keep inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-navy-700 ring-1 ring-navy-100 transition hover:bg-navy-50 hover:text-gold-600" title="Télécharger le reçu (PDF)">
        <FileText size={14} aria-hidden />{r.receipt_number}
      </a>
      {r.proof_stored && (
        <a href={`/api/fichiers/paiement/${r.id}`} target="_blank" className="row-keep grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100" title="Voir le justificatif" aria-label={`Voir le justificatif du paiement ${r.receipt_number}`}>
          <Paperclip size={15} />
        </a>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Paiements"
        subtitle="Tous les encaissements. Un paiement s'enregistre depuis la fiche de la facture."
        actions={seeInvoices ? <Link href="/factures" className="btn-ghost"><FileText size={16} aria-hidden /> Factures</Link> : undefined}
      />

      <div className="space-y-5">
        <MonthNav path={PATH} month={month} keep={{ method }} />

        <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${seeInvoices ? "xl:grid-cols-3" : ""}`}>
          <Stat
            label={method ? `Encaissé · ${methodLabel}` : "Encaissé"}
            value={fdj(total)}
            tone="green"
            icon={<Wallet size={18} />}
            hint={all ? `${n} paiement${n > 1 ? "s" : ""} au total` : <Delta cur={total} prev={prevTotal} prevMonth={prevMonth} upIsGood />}
          />
          <Stat
            label="Paiements reçus"
            value={n}
            icon={<Receipt size={18} />}
            hint={n ? `Moyenne ${fdj(total / n)} · ${rows.filter((r) => r.proof_stored).length} avec justificatif` : `Aucun ${inMonth(month)}`}
          />
          {seeInvoices && (
            <Stat
              label="Reste à encaisser"
              value={fdj(unpaidTotal)}
              tone={overdue.length ? "red" : "gold"}
              icon={<Hourglass size={18} />}
              hint={unpaid.length
                ? `${unpaid.length} facture${unpaid.length > 1 ? "s" : ""}${overdue.length ? ` · ${overdue.length} en retard` : ""} · toutes périodes`
                : "Toutes les factures sont soldées"}
              className="col-span-2 xl:col-span-1"
            />
          )}
        </div>

        <div className={`grid items-start gap-5 ${seeInvoices ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
          <div className="min-w-0 space-y-5">
            <Breakdown
              title={`Par mode de paiement · ${monthLabel(month)}`}
              slices={slices}
              active={method || undefined}
              resetHref={href(PATH, { m: month })}
              empty={`Aucun encaissement ${inMonth(month)}.`}
              unit={["paiement", "paiements"]}
            />

            <section className="card min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-5 sm:px-6">
                <h2 className="h-section">{method ? `${methodLabel} · ` : ""}{monthLabel(month)}</h2>
                {n > 0 && <span className="text-sm text-navy-600/70">{n} paiement{n > 1 ? "s" : ""}</span>}
              </div>
              {n === 0 ? (
                <Empty title={method ? `Aucun paiement par ${methodLabel} ${inMonth(month)}` : `Aucun paiement ${inMonth(month)}`}>
                  <p>Les paiements s'enregistrent depuis la fiche de chaque facture.</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {method && <Link href={href(PATH, { m: month })} className="btn-ghost btn-sm">Tous les modes</Link>}
                    {!all && prev && prev.n > 0 && <Link href={href(PATH, { m: prevMonth, method })} className="btn-ghost btn-sm">Voir {monthLabel(prevMonth)} ({prev.n})</Link>}
                    {seeInvoices && unpaid.length > 0 && <a href="#a-encaisser" className="btn-ghost btn-sm xl:hidden">Factures à encaisser ({unpaid.length})</a>}
                  </div>
                </Empty>
              ) : (
                <>
                  <div className="hidden md:block">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="w-[7.5rem]">Date</th>
                        <th>Client / facture</th>
                        <th>Mode</th>
                        <th className="num">Montant</th>
                        <th>Reçu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="clickable">
                          <td className="whitespace-nowrap text-navy-600">{dateFr(r.date)}</td>
                          <td className="min-w-[10rem]">
                            <span className="font-bold text-navy-900">{r.client_name}</span>
                            <div className="text-sm">
                              <Link href={`/factures/${r.invoice_id}`} className="link row-hit font-normal">Facture {r.invoice_number}</Link>
                            </div>
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${METHOD_COLOR[r.method] ?? "bg-navy-200"}`} aria-hidden />
                              {PAYMENT_METHODS[r.method] ?? r.method}
                            </span>
                            {r.reference && <div className="text-xs text-navy-600/70">Réf. {r.reference}</div>}
                          </td>
                          <td className="num font-bold text-emerald-700">{fdj(r.amount)}</td>
                          <td className="whitespace-nowrap">
                            {receipt(r)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <ul className="divide-y divide-navy-50 border-t border-navy-50 md:hidden">
                    {rows.map((r) => (
                      <li key={r.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={`/factures/${r.invoice_id}`} className="block font-bold leading-snug text-navy-900 hover:text-gold-600">{r.client_name}</Link>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-navy-600/75">
                              <span>{dateFr(r.date)}</span>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-1">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${METHOD_COLOR[r.method] ?? "bg-navy-200"}`} aria-hidden />
                                {PAYMENT_METHODS[r.method] ?? r.method}
                              </span>
                              {r.reference && <><span aria-hidden>·</span><span>Réf. {r.reference}</span></>}
                            </p>
                          </div>
                          <b className="shrink-0 tabular-nums text-emerald-700">{fdj(r.amount)}</b>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <Link href={`/factures/${r.invoice_id}`} className="link text-sm font-normal">Facture {r.invoice_number}</Link>
                          {receipt(r)}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-gold/30 bg-gold/5 px-5 py-3 sm:px-6">
                    <span className="text-sm font-bold text-navy-700">Total encaissé {method ? `par ${methodLabel} ` : ""}{inMonth(month)}</span>
                    <span className="text-lg font-bold tabular-nums text-emerald-700">{fdj(total)}</span>
                  </div>
                </>
              )}
            </section>
          </div>

          {seeInvoices && (
            <aside id="a-encaisser" className="card min-w-0 scroll-mt-6 overflow-hidden xl:sticky xl:top-6">
              <div className="px-5 pb-3 pt-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="h-section">À encaisser</h2>
                  {overdue.length > 0 && <span className="badge bg-red-600 text-white">{overdue.length} en retard</span>}
                </div>
                {unpaid.length > 0 && (
                  <p className="mt-1.5 text-sm text-navy-600/75">
                    <b className="text-base tabular-nums text-navy">{fdj(unpaidTotal)}</b> sur {unpaid.length} facture{unpaid.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
              {unpaid.length === 0 ? (
                <Empty title="Tout est encaissé">Aucune facture n'attend de paiement.</Empty>
              ) : (
                <ul className="divide-y divide-navy-50 border-t border-navy-50">
                  {unpaid.map((i) => {
                    const pct = i.total ? Math.round((i.paid / i.total) * 100) : 0;
                    return (
                      <li key={i.id} className={`px-5 py-4 ${i.overdue ? "bg-red-50/40" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={`/factures/${i.id}`} className="link block truncate">{i.clientName}</Link>
                            <div className="truncate text-sm text-navy-600/70" title={i.subject}>{i.number}{i.subject ? ` · ${i.subject}` : ""}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <b className={`block tabular-nums ${i.overdue ? "text-red-700" : "text-navy"}`}>{fdj(i.remaining)}</b>
                            {i.paid > 0 && <span className="text-xs text-navy-600/60">sur {fdj(i.total)}</span>}
                          </div>
                        </div>
                        {i.paid > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1"><Progress value={pct} tone="green" /></div>
                            <span className="text-xs tabular-nums text-navy-600/70">{pct} % payé</span>
                          </div>
                        )}
                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <PayBadge s={i.paymentStatus} overdue={i.overdue} />
                            <span className="text-xs text-navy-600/60">émise le {dateFr(i.issueDate)}</span>
                          </span>
                          <Link href={`/factures/${i.id}${payWrite ? "#encaisser" : ""}`} className={`ml-auto ${payWrite ? "btn-gold btn-sm" : "btn-ghost btn-sm"}`}>
                            {payWrite ? <><HandCoins size={14} aria-hidden /> Encaisser</> : <>Voir <ArrowUpRight size={14} aria-hidden /></>}
                            <span className="sr-only"> — facture {i.number}</span>
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
