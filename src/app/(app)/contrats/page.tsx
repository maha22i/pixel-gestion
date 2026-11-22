import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { BellRing, FilePen, FileSignature, Library, Plus, RefreshCw, Wallet } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { dateFr, fdj } from "@/lib/format";
import { PageHeader, Empty, Stat } from "@/components/ui";
import { CONTRACT_STATUS, displayStatus, endingSoon, type ContractStatus } from "@/lib/contractModel";
import { Status } from "./Status";
import { ContractFilters } from "./ContractFilters";
import { ensureContractSeeds } from "@/lib/contractData";
import { renewContract } from "./actions";

function elapsed(start: string | null, end: string | null, today: string) {
  if (!start || !end || end <= start) return null;
  const a = Date.parse(start), b = Date.parse(end), t = Date.parse(today);
  return Math.max(0, Math.min(100, Math.round(((t - a) / (b - a)) * 100)));
}

export default async function ContractsPage({ searchParams }: { searchParams: { q?: string; s?: string; client?: string } }) {
  const user = await requirePerm("contrats");
  const write = can(user, "contrats", "write");
  await ensureContractSeeds();
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const st = searchParams.s ?? "";
  const client = searchParams.client ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const [rows, clients] = await Promise.all([
    db.select().from(schema.contracts).orderBy(desc(schema.contracts.createdAt), desc(schema.contracts.id)),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name)),
  ]);
  const withStatus = rows.map((c) => ({ ...c, shown: displayStatus(c, today) }));
  const scoped = withStatus.filter((c) => {
    const blob = `${c.number ?? ""} ${c.clientName} ${c.clientAcronym} ${c.title} ${c.templateName ?? ""}`.toLowerCase();
    return (!q || blob.includes(q)) && (!client || String(c.clientId) === client);
  });
  const filtered = scoped.filter((c) => !st || c.shown === st);
  const counts = Object.fromEntries(Object.keys(CONTRACT_STATUS).map((k) => [k, scoped.filter((c) => c.shown === k).length])) as Record<ContractStatus, number>;
  const soon = withStatus.filter((c) => endingSoon(c, today));
  const active = withStatus.filter((c) => c.shown === "en_cours" || c.shown === "signe");
  const toSign = withStatus.filter((c) => c.shown === "brouillon" || c.shown === "envoye");
  const monthly = active.filter((c) => c.amountMode === "monthly").reduce((n, c) => n + c.monthlyAmount, 0);
  const chip = (k: string) => {
    const sp = new URLSearchParams();
    if (searchParams.q) sp.set("q", searchParams.q);
    if (client) sp.set("client", client);
    if (k) sp.set("s", k);
    const qs = sp.toString();
    return `/contrats${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle="Numérotation PN-CTR-AAAA-XXX, attribuée à l’enregistrement"
        actions={write && (
          <>
            <Link href="/contrats/modeles" className="btn-ghost"><Library size={16} /> Modèles</Link>
            <Link href="/contrats/nouveau" className="btn-primary"><Plus size={16} /> Nouveau contrat</Link>
          </>
        )}
      />

      {rows.length === 0 ? (
        <div className="card">
          <Empty title="Aucun contrat pour l’instant">
            Partez d’un modèle prêt à l’emploi : client, prestations, durée et montant se remplissent en quelques minutes.
          </Empty>
          {write && (
            <div className="-mt-6 flex flex-wrap justify-center gap-2 px-6 pb-12">
              <Link href="/contrats/nouveau" className="btn-primary"><Plus size={16} /> Créer votre premier contrat</Link>
              <Link href="/contrats/modeles" className="btn-ghost">Voir les modèles</Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <Stat label="En cours" value={active.length} tone="green" icon={<FileSignature size={18} />} hint="signés et actifs" />
            <Stat label="Mensuel actif" value={fdj(monthly)} tone="navy" icon={<Wallet size={18} />} hint="forfaits mensuels en cours" />
            <Stat label="À faire signer" value={toSign.length} tone="blue" icon={<FilePen size={18} />} hint="brouillons et envoyés" />
            <Stat label="À renouveler" value={soon.length} tone={soon.length ? "gold" : "navy"} icon={<BellRing size={18} />} hint="fin dans moins de 30 jours" />
          </div>

          {soon.length > 0 && (
            <div className="mb-5 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3">
              <p className="flex items-center gap-2 font-bold text-navy"><BellRing size={16} className="text-amber-700" /> À renouveler — fin dans moins de 30 jours</p>
              <ul className="mt-2 divide-y divide-gold/20">
                {soon.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Link href={`/contrats/${c.id}`} className="link">{c.number}</Link>
                    <span className="font-bold">{c.clientName}</span>
                    <span className="text-navy-600/80">fin le {dateFr(c.endDate)}</span>
                    {write && (
                      <form action={renewContract.bind(null, c.id)} className="ml-auto">
                        <button className="btn-gold btn-sm"><RefreshCw size={13} /> Renouveler</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-3 flex flex-wrap gap-2">
            <Link href={chip("")} className={!st ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Tous <span className="opacity-60">{scoped.length}</span></Link>
            {(Object.entries(CONTRACT_STATUS) as [ContractStatus, string][]).map(([k, v]) => (
              <Link key={k} href={chip(k)} className={st === k ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
                {v} <span className="opacity-60">{counts[k]}</span>
              </Link>
            ))}
          </div>
          <div className="mb-4"><ContractFilters clients={clients} /></div>

          <div className="card overflow-x-auto">
            {filtered.length === 0 ? (
              <Empty title="Aucun contrat ne correspond">
                <Link href="/contrats" className="link">Effacer les filtres</Link>
              </Empty>
            ) : (
              <table className="table">
                <thead><tr><th>N°</th><th>Client / intitulé</th><th>Période</th><th className="num">Montant</th><th>Statut</th></tr></thead>
                <tbody>
                  {filtered.map((c) => {
                    const pct = c.shown === "en_cours" ? elapsed(c.startDate, c.endDate, today) : null;
                    return (
                      <tr key={c.id} className="clickable">
                        <td><Link className="link row-hit whitespace-nowrap" href={`/contrats/${c.id}`}>{c.number}</Link></td>
                        <td>
                          <span className="font-bold">{c.clientName || "—"}</span>
                          <div className="line-clamp-1 text-sm text-navy-600/70">{c.title.replaceAll("\n", " ") || c.templateName || "Contrat"}</div>
                        </td>
                        <td className="whitespace-nowrap">
                          {c.startDate || c.endDate ? <>{dateFr(c.startDate)} → {dateFr(c.endDate)}</> : <span className="text-navy-600/50">À définir</span>}
                          {pct !== null && (
                            <div className="mt-1 h-1 w-36 max-w-full overflow-hidden rounded-full bg-navy-50" title={`${pct} % écoulé`}>
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                          {endingSoon(c, today) && <div className="text-xs font-bold text-amber-700">Fin dans moins de 30 jours</div>}
                        </td>
                        <td className="num">
                          <span className="font-bold">{fdj(c.totalAmount)}</span>
                          {c.amountMode === "monthly" && c.monthlyAmount > 0 && <div className="text-xs text-navy-600/70">{fdj(c.monthlyAmount)} / mois</div>}
                        </td>
                        <td><Status s={c.shown} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
