import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { invoicesFinance } from "@/lib/finance";
import { CLIENT_TYPES, PROJECT_TYPES, dateFr, fdj } from "@/lib/format";
import { PageHeader, ProjectBadge, QuoteBadge, PayBadge, Stat, Empty } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { displayStatus } from "@/lib/contractModel";
import { Status } from "../../contrats/Status";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ClientForm } from "../ClientForm";
import { deleteClient, updateClient } from "../actions";

export default async function ClientPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string } }) {
  const user = await requirePerm("clients");
  const id = Number(params.id);
  const [c] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
  if (!c) notFound();
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.clientId, id)).orderBy(desc(schema.projects.createdAt));
  const quotes = await db.select().from(schema.quotes).where(eq(schema.quotes.clientId, id)).orderBy(desc(schema.quotes.issueDate));
  const contracts = can(user, "contrats")
    ? await db.select().from(schema.contracts).where(eq(schema.contracts.clientId, id)).orderBy(desc(schema.contracts.createdAt))
    : [];
  const invoices = await invoicesFinance(sql`i.client_id = ${id}`);
  const invoiced = invoices.filter((i) => i.status !== "annulee").reduce((s, i) => s + i.total, 0);
  const paid = invoices.filter((i) => i.status !== "annulee").reduce((s, i) => s + i.paid, 0);
  const write = can(user, "clients", "write");

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={<span className="badge-gray">{CLIENT_TYPES[c.type]}</span>}
        back={{ href: "/clients", label: "Clients" }}
        actions={<>
          {can(user, "projets", "write") && <Link href={`/projets/nouveau?client=${id}`} className="btn-ghost">+ Projet</Link>}
          {can(user, "devis", "write") && <Link href={`/devis/nouveau?client=${id}`} className="btn-primary">+ Devis</Link>}
          {can(user, "contrats", "write") && <Link href={`/contrats/nouveau?client=${id}`} className="btn-ghost">+ Contrat</Link>}
        </>}
      />
      <Flash message={searchParams.ok ? "Client mis à jour." : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e === "lie" ? "Impossible de supprimer : ce client a des devis ou factures." : ""} clear={["e"]} />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Total facturé" value={fdj(invoiced)} />
        <Stat label="Total encaissé" value={fdj(paid)} tone="green" />
        <Stat label="Reste à payer" value={fdj(invoiced - paid)} tone={invoiced - paid > 0 ? "red" : "navy"} />
      </div>

      <div className="grid xl:grid-cols-[1fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <ClientForm action={updateClient.bind(null, id)} c={c} disabled={!write} />
          {write && (
            <form action={deleteClient.bind(null, id)}>
              <ConfirmButton message="Supprimer ce client ?">Supprimer le client</ConfirmButton>
            </form>
          )}
        </div>
        <div className="space-y-6">
          <section className="card">
            <p className="h-section px-5 pt-5 pb-2">Projets</p>
            {projects.length === 0 ? <Empty title="Aucun projet" /> : (
              <table className="table"><tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="clickable">
                    <td><Link href={`/projets/${p.id}`} className="link row-hit">{p.title}</Link><div className="text-sm text-navy-600/70">{PROJECT_TYPES[p.type]}</div></td>
                    <td>{dateFr(p.startDate)}</td>
                    <td><ProjectBadge s={p.status} /></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </section>
          <section className="card">
            <p className="h-section px-5 pt-5 pb-2">Devis</p>
            {quotes.length === 0 ? <Empty title="Aucun devis" /> : (
              <table className="table"><tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="clickable">
                    <td><Link href={`/devis/${q.id}`} className="link row-hit">{q.number}</Link><div className="text-sm text-navy-600/70">{q.subject}</div></td>
                    <td className="num">{fdj(q.total)}</td>
                    <td><QuoteBadge s={q.status} /></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </section>
          {can(user, "contrats") && (
            <section className="card">
              <p className="h-section px-5 pt-5 pb-2">Contrats</p>
              {contracts.length === 0 ? <Empty title="Aucun contrat" /> : (
                <table className="table"><tbody>
                  {contracts.map((ct) => (
                    <tr key={ct.id} className="clickable">
                      <td><Link href={`/contrats/${ct.id}`} className="link row-hit">{ct.number}</Link><div className="text-sm text-navy-600/70">{ct.title.replaceAll("\n", " ")}</div></td>
                      <td className="num">{fdj(ct.totalAmount)}</td>
                      <td><Status s={displayStatus(ct)} /></td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </section>
          )}
          <section className="card">
            <p className="h-section px-5 pt-5 pb-2">Factures</p>
            {invoices.length === 0 ? <Empty title="Aucune facture" /> : (
              <table className="table"><tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="clickable">
                    <td><Link href={`/factures/${i.id}`} className="link row-hit">{i.number}</Link><div className="text-sm text-navy-600/70">{i.subject}</div></td>
                    <td className="num">{fdj(i.total)}<div className="text-sm text-red-700">{i.remaining > 0 ? `reste ${fdj(i.remaining)}` : ""}</div></td>
                    <td><PayBadge s={i.paymentStatus} overdue={i.overdue} /></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
