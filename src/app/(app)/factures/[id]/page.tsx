import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { FileDown, Pencil, FileText } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { invoicesFinance } from "@/lib/finance";
import { allocate, INSTALLMENT_STATE } from "@/lib/schedule";
import { PAYMENT_METHODS, PROJECT_TYPES, dateFr, fdj, today } from "@/lib/format";
import { amountInWords } from "@/lib/words";
import { PageHeader, PayBadge } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton, SubmitButton } from "@/components/ConfirmButton";
import { DocLines } from "@/components/DocLines";
import { InstallmentsEditor } from "../InstallmentsEditor";
import { addPayment, deleteInvoice, deletePayment, saveInstallments, setInvoiceCancelled } from "../actions";

const ERR: Record<string, string> = {
  paiement: "Paiement invalide : vérifiez le montant, la date et le mode.",
  trop: "Le paiement dépasse le reste à payer.",
  paiements: "Impossible : cette facture a déjà des paiements. Supprimez-les d'abord.",
  echeancier: "Le total des échéances doit être égal au total de la facture.",
  total: "Le nouveau total est inférieur aux paiements déjà reçus.",
  taille: "Le fichier dépasse 15 Mo.",
  type: "Le justificatif doit être un PDF ou une photo.",
};
const OK: Record<string, string> = { "1": "Facture enregistrée.", paiement: "Paiement enregistré. Le reçu est disponible.", echeancier: "Échéancier mis à jour." };

export default async function InvoicePage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string; ech?: string } }) {
  const user = await requirePerm("factures");
  const id = Number(params.id);
  const [fin] = await invoicesFinance(sql`i.id = ${id}`);
  if (!fin) notFound();
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  const items = await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, id)).orderBy(asc(schema.invoiceItems.position));
  const inst = await db.select().from(schema.installments).where(eq(schema.installments.invoiceId, id)).orderBy(asc(schema.installments.position));
  const pays = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, id)).orderBy(desc(schema.payments.date), desc(schema.payments.id));
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
  const [project] = inv.projectId ? await db.select().from(schema.projects).where(eq(schema.projects.id, inv.projectId)) : [];
  const [quote] = inv.quoteId ? await db.select({ id: schema.quotes.id, number: schema.quotes.number }).from(schema.quotes).where(eq(schema.quotes.id, inv.quoteId)) : [];
  const events = Object.fromEntries((await db.select().from(schema.eventTypes)).map((e) => [e.id, e.name]));
  const t = today();
  const schedule = allocate(inst, fin.paid, t);
  const write = can(user, "factures", "write");
  const payWrite = can(user, "paiements", "write") && inv.status !== "annulee" && fin.remaining > 0;
  const pct = fin.total ? Math.round((fin.paid / fin.total) * 100) : 0;
  const nextDue = schedule.find((s) => s.remaining > 0);
  const st = await getSettings();

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3 flex-wrap">{st.logoPath && <img src={st.logoPath} alt={st.companyName} className="h-11 max-w-[160px] object-contain" />}{inv.number} <PayBadge s={fin.paymentStatus} overdue={fin.overdue} /></span>}
        subtitle={inv.subject}
        back={{ href: "/factures", label: "Factures" }}
        actions={<>
          <a href={`/api/pdf/facture/${id}`} target="_blank" className="btn-gold"><FileDown size={16} /> PDF</a>
          {write && inv.status !== "annulee" && <Link href={`/factures/${id}/modifier`} className="btn-ghost"><Pencil size={16} /> Modifier</Link>}
          {quote && <Link href={`/devis/${quote.id}`} className="btn-ghost"><FileText size={16} /> Devis {quote.number}</Link>}
        </>}
      />
      <Flash message={searchParams.ok ? OK[searchParams.ok] : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e ? ERR[searchParams.e] : ""} clear={["e"]} />
      {inv.status === "annulee" && <p className="mb-4 rounded-lg bg-navy-50 text-navy-700 px-4 py-2 font-bold">Cette facture est annulée et n'entre plus dans les totaux.</p>}

      <div className="grid xl:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="card card-pad">
              <p className="h-section">Client</p>
              <Link href={`/clients/${client.id}`} className="link text-lg">{client.name}</Link>
              <p className="text-sm text-navy-600">{[client.phone, client.email].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="card card-pad">
              <p className="h-section">Projet</p>
              {project ? (<><Link href={`/projets/${project.id}`} className="link">{project.title}</Link><p className="text-sm text-navy-600">{PROJECT_TYPES[project.type]}</p></>) : <p className="text-navy-600/60">—</p>}
            </div>
            <div className="card card-pad">
              <p className="h-section">Date</p>
              <p>Émise le <b>{dateFr(inv.issueDate)}</b></p>
            </div>
          </div>
          <DocLines lines={items} events={events} subtotal={inv.subtotal} discount={inv.discount} total={inv.total}
            extra={<p className="text-sm italic text-navy-600 pt-1">{amountInWords(inv.total)}</p>} />

          {/* Historique des paiements */}
          <section className="card">
            <p className="h-section px-5 pt-5 pb-2">Paiements reçus</p>
            {pays.length === 0 ? <p className="px-5 pb-5 text-navy-600/70">Aucun paiement enregistré.</p> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Date</th><th>Reçu</th><th>Mode</th><th>Référence</th><th className="num">Montant</th><th /></tr></thead>
                  <tbody>
                    {pays.map((p) => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap">{dateFr(p.date)}</td>
                        <td>
                          <a href={`/api/pdf/recu/${p.id}`} target="_blank" className="link whitespace-nowrap">{p.receiptNumber}</a>
                          {p.proofStored && <div><a href={`/api/fichiers/paiement/${p.id}`} target="_blank" className="text-sm link font-normal">Justificatif</a></div>}
                        </td>
                        <td>{PAYMENT_METHODS[p.method] ?? p.method}</td>
                        <td className="text-navy-600 text-sm">{p.reference ?? "—"}{p.notes && <div className="text-navy-600/60">{p.notes}</div>}</td>
                        <td className="num font-bold text-emerald-700">{fdj(p.amount)}</td>
                        <td>
                          {can(user, "paiements", "write") && (
                            <form action={deletePayment.bind(null, p.id)}>
                              <ConfirmButton message={`Supprimer le paiement ${p.receiptNumber} de ${fdj(p.amount)} ?`}>Suppr.</ConfirmButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {write && (
            <div className="flex flex-wrap gap-2">
              {inv.status === "annulee" ? (
                <form action={setInvoiceCancelled.bind(null, id, false)}><button className="btn-ghost">Rétablir la facture</button></form>
              ) : pays.length === 0 && (
                <form action={setInvoiceCancelled.bind(null, id, true)}><ConfirmButton className="btn-ghost" message="Annuler cette facture ?">Annuler la facture</ConfirmButton></form>
              )}
              {pays.length === 0 && (
                <form action={deleteInvoice.bind(null, id)}><ConfirmButton message={`Supprimer définitivement ${inv.number} ?`}>Supprimer</ConfirmButton></form>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6">
          {/* Suivi */}
          <div className="card card-pad">
            <p className="h-section mb-3">Suivi des paiements</p>
            <div className="h-2.5 rounded-full bg-navy-50 overflow-hidden mb-3">
              <div className="h-full bg-gold" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between"><span>Total facture</span><b className="tabular-nums">{fdj(fin.total)}</b></div>
              <div className="flex justify-between text-emerald-700"><span>Payé ({pct} %)</span><b className="tabular-nums">{fdj(fin.paid)}</b></div>
              <div className="flex justify-between rounded-lg bg-navy text-white px-3 py-2 mt-2"><span className="font-bold">Reste à payer</span><b className="tabular-nums text-gold">{fdj(fin.remaining)}</b></div>
            </div>
            {nextDue && inv.status !== "annulee" && (
              <p className={`mt-3 text-sm ${nextDue.state === "retard" ? "text-red-700 font-bold" : "text-navy-600"}`}>
                Prochaine échéance : {nextDue.label} — {fdj(nextDue.remaining)} {nextDue.dueDate ? `le ${dateFr(nextDue.dueDate)}` : "(à la livraison)"}
              </p>
            )}
          </div>

          {/* Encaisser */}
          {payWrite && (
            <form id="encaisser" action={addPayment.bind(null, id)} encType="multipart/form-data" className="card card-pad scroll-mt-20 space-y-3">
              <p className="h-section">Enregistrer un paiement</p>
              <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
                <div><label className="label">Montant (FDJ)</label><input name="amount" type="number" min={1} max={fin.remaining} className="input" defaultValue={nextDue?.remaining ?? fin.remaining} required /></div>
                <div><label className="label">Date</label><input name="date" type="date" className="input" defaultValue={t} required /></div>
              </div>
              <div>
                <label className="label">Mode de paiement</label>
                <select name="method" className="input" required defaultValue="waafi">
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="label">Référence (n° transaction, chèque…)</label><input name="reference" className="input" /></div>
              <div><label className="label">Note</label><input name="notes" className="input" /></div>
              <div>
                <label className="label">Justificatif</label>
                <input name="file" type="file" accept="application/pdf,image/*" className="block w-full text-sm text-navy-700 file:mr-3 file:rounded-lg file:border file:border-navy-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-navy" />
                <p className="mt-1 text-xs text-navy-600/60">PDF ou photo du reçu, 15 Mo maximum. Facultatif.</p>
              </div>
              <SubmitButton className="btn-gold w-full">Encaisser</SubmitButton>
            </form>
          )}

          {/* Échéancier */}
          <div className="card card-pad">
            <div className="flex items-center justify-between mb-3">
              <p className="h-section">Échéancier</p>
              {write && inv.status !== "annulee" && !searchParams.ech && <Link href={`/factures/${id}?ech=1`} className="text-sm link">Modifier</Link>}
            </div>
            {searchParams.ech && write ? (
              <InstallmentsEditor action={saveInstallments.bind(null, id)} total={inv.total} onCancelHref={`/factures/${id}`}
                initial={inst.map((i) => ({ label: i.label, amount: i.amount, dueDate: i.dueDate }))} />
            ) : (
              <ul className="space-y-2">
                {schedule.map((s) => {
                  const [label, cls] = INSTALLMENT_STATE[s.state];
                  return (
                    <li key={s.id} className="rounded-lg border border-navy-100 px-3 py-2">
                      <div className="flex justify-between gap-2"><b>{s.label}</b><span className={cls}>{label}</span></div>
                      <div className="flex justify-between text-sm text-navy-600 mt-0.5">
                        <span>{s.dueDate ? `Échéance ${dateFr(s.dueDate)}` : "À la livraison"}</span>
                        <span className="tabular-nums">{fdj(s.amount)}{s.state === "partielle" && ` · reste ${fdj(s.remaining)}`}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
