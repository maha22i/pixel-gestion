import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { dateFr, fdj } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { CONTRACT_STATUS, displayStatus, endingSoon } from "@/lib/contractModel";
import { Status } from "./Status";
import { ensureContractSeeds } from "@/lib/contractData";
import { renewContract } from "./actions";

export default async function ContractsPage({ searchParams }: { searchParams: { q?: string; s?: string; client?: string } }) {
  const user = await requirePerm("contrats");
  await ensureContractSeeds();
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const st = searchParams.s ?? "";
  const client = searchParams.client ?? "";
  const rows = await db.select().from(schema.contracts).orderBy(asc(schema.contracts.createdAt));
  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name));
  const filtered = rows.filter((c) => {
    const shown = displayStatus(c);
    const blob = `${c.number ?? ""} ${c.clientName} ${c.title} ${c.templateName ?? ""}`.toLowerCase();
    return (!q || blob.includes(q)) && (!st || shown === st) && (!client || String(c.clientId) === client);
  });
  const soon = rows.filter((c) => endingSoon(c));
  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle="Numérotation PN-CTR-AAAA-XXX, attribuée à l’enregistrement"
        actions={can(user, "contrats", "write") && (
          <span className="flex flex-wrap gap-2">
            <Link href="/contrats/modeles" className="btn-ghost">Modèles</Link>
            <Link href="/contrats/nouveau" className="btn-primary">+ Contrat</Link>
          </span>
        )}
      />
      {soon.length > 0 && (
        <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
          <p className="font-bold text-navy">À renouveler — fin dans moins de 30 jours</p>
          <ul className="mt-2 space-y-1">
            {soon.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                <Link href={`/contrats/${c.id}`} className="link">{c.number} — {c.clientName}</Link>
                <span>fin le {dateFr(c.endDate)}</span>
                {can(user, "contrats", "write") && (
                  <form action={renewContract.bind(null, c.id)}>
                    <button className="btn-gold btn-sm">Renouveler</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <form className="flex flex-wrap gap-2 mb-4">
        <input name="q" defaultValue={searchParams.q} placeholder="N°, client, intitulé…" className="input max-w-xs" />
        <select name="s" defaultValue={st} className="input max-w-[180px]">
          <option value="">Tous les statuts</option>
          {Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="client" defaultValue={client} className="input max-w-xs">
          <option value="">Tous les clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn-ghost">Filtrer</button>
      </form>
      <div className="card overflow-x-auto">
        {filtered.length === 0 ? <Empty title="Aucun contrat" /> : (
          <table className="table">
            <thead><tr><th>N°</th><th>Client</th><th>Type / intitulé</th><th>Début</th><th>Fin</th><th className="num">Montant</th><th>Statut</th></tr></thead>
            <tbody>
              {filtered.map((c) => {
                const shown = displayStatus(c);
                return (
                  <tr key={c.id} className="clickable">
                    <td><Link className="link row-hit whitespace-nowrap" href={`/contrats/${c.id}`}>{c.number}</Link></td>
                    <td className="font-bold">{c.clientName}</td>
                    <td>{c.templateName || "Contrat"}<div className="text-sm text-navy-600/70">{c.title.replaceAll("\n", " ")}</div></td>
                    <td>{dateFr(c.startDate)}</td>
                    <td>{dateFr(c.endDate)}{endingSoon(c) && <div className="text-xs font-bold text-amber-700">Moins de 30 jours</div>}</td>
                    <td className="num">{fdj(c.totalAmount)}</td>
                    <td><Status s={shown} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
