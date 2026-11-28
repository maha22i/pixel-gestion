import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowRight, Building2, CalendarDays, FilePlus2, FileText, ListOrdered, Receipt, Wallet, X } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { fdj } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ContractEditor, type EditorState } from "../ContractEditor";
import { editorContext, emptyState } from "../loadEditor";
import { saveContract } from "../actions";
import { asDefs, asSections, asServices, clientSnapshot } from "@/lib/contractData";
import type { Block } from "@/lib/contractModel";

type SP = { modele?: string; client?: string; projet?: string; devis?: string; e?: string };

function href(sp: SP, patch: Partial<SP>) {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...patch, e: undefined })) if (v) next[k] = v;
  const qs = new URLSearchParams(next).toString();
  return `/contrats/nouveau${qs ? `?${qs}` : ""}`;
}

export default async function NewContractPage({ searchParams }: { searchParams: SP }) {
  await requirePerm("contrats", "write");
  const ctx = await editorContext();
  const choosing = searchParams.modele === undefined;

  if (choosing) {
    const client = searchParams.client ? ctx.clients.find((c) => String(c.id) === searchParams.client) : undefined;
    const quote = searchParams.devis ? ctx.quotes.find((q) => String(q.id) === searchParams.devis) : undefined;
    const accepted = ctx.quotes.filter((q) => q.status === "accepte" && (!client || q.clientId === client.id));
    const clientName = (id: number) => ctx.clients.find((c) => c.id === id)?.name ?? "";
    const hasBlank = ctx.templates.some((t) => asSections(t.sections).length === 0);
    return (
      <>
        <PageHeader title="Nouveau contrat" subtitle="Choisissez un point de départ : vous pourrez tout ajuster ensuite." back={{ href: "/contrats", label: "Contrats" }} />
        {(client || quote) && (
          <div className="mb-5 flex flex-wrap gap-2">
            {client && (
              <span className="inline-flex items-center gap-2 rounded-full border border-navy-100 bg-white px-3 py-1.5 text-sm">
                <Building2 size={15} className="text-navy-600" /> Pour <b>{client.name}</b>
                <Link href={href(searchParams, { client: undefined, projet: undefined })} aria-label="Retirer le client" className="text-navy-600/60 hover:text-red-600"><X size={15} /></Link>
              </span>
            )}
            {quote && (
              <span className="inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold-50 px-3 py-1.5 text-sm">
                <Receipt size={15} className="text-amber-700" /> Depuis le devis <b>{quote.number}</b> · {fdj(quote.total)}
                <Link href={href(searchParams, { devis: undefined })} aria-label="Retirer le devis" className="text-navy-600/60 hover:text-red-600"><X size={15} /></Link>
              </span>
            )}
          </div>
        )}

        <p className="h-section mb-3">1 · Choisir un modèle</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ctx.templates.map((t) => {
            const secs = asSections(t.sections);
            const nArt = secs.filter((s) => s.kind !== "annex").length;
            const nAnx = secs.length - nArt;
            return (
              <Link
                key={t.id}
                href={href(searchParams, { modele: String(t.id) })}
                className="card group flex flex-col p-5 transition-colors hover:border-gold/70"
              >
                <div className="flex items-start gap-3">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${secs.length ? "bg-navy text-white" : "bg-navy-50 text-navy-600"}`}>
                    {secs.length ? <FileText size={20} /> : <FilePlus2 size={20} />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold leading-snug text-navy">{t.name}</p>
                    {t.description && <p className="mt-1 text-sm text-navy-600/80">{t.description}</p>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className={t.amountMode === "monthly" ? "badge-gold" : "badge-blue"}>
                    <Wallet size={12} /> {t.amountMode === "monthly" ? "Forfait mensuel" : "Montant unique"}
                  </span>
                  <span className="badge-gray">
                    <CalendarDays size={12} /> {t.durationUnit === "end" || !t.durationValue ? "Durée libre" : `${t.durationValue} ${t.durationUnit === "days" ? "jours" : "mois"}`}
                  </span>
                  <span className="badge-gray">
                    <ListOrdered size={12} /> {secs.length ? `${nArt} article${nArt > 1 ? "s" : ""}${nAnx ? ` + ${nAnx} annexe${nAnx > 1 ? "s" : ""}` : ""}` : "Aucun article"}
                  </span>
                </div>
                <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-bold text-navy-700 group-hover:text-gold-600">
                  Utiliser ce modèle <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
          {!hasBlank && (
            <Link href={href(searchParams, { modele: "0" })} className="card flex flex-col items-center justify-center gap-2 border-2 border-dashed border-navy-100 p-5 text-center transition hover:ring-2 hover:ring-gold/70">
              <FilePlus2 size={22} className="text-navy-300" />
              <span className="font-bold text-navy">Partir d’une page blanche</span>
              <span className="text-sm text-navy-600/75">Sans article, à composer depuis la bibliothèque.</span>
            </Link>
          )}
        </div>

        {!quote && accepted.length > 0 && (
          <div className="mt-8">
            <p className="h-section mb-3">Ou reprendre un devis accepté <span className="normal-case tracking-normal text-navy-600/60">— client, prestations et montant pré-remplis</span></p>
            <div className="card divide-y divide-navy-100/70">
              {accepted.slice(0, 8).map((q) => (
                <Link key={q.id} href={href(searchParams, { devis: String(q.id), client: undefined })} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition hover:bg-gold/10">
                  <Receipt size={16} className="text-amber-700" />
                  <span className="font-bold text-navy">{q.number}</span>
                  <span className="min-w-0 flex-1 truncate text-navy-600">{clientName(q.clientId)} · {q.subject}</span>
                  <span className="font-bold tabular-nums">{fdj(q.total)}</span>
                  <ArrowRight size={15} className="text-navy-600/60" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  let state: EditorState = emptyState(ctx.settings);
  const tpl = ctx.templates.find((t) => String(t.id) === searchParams.modele);
  if (tpl) {
    state = {
      ...state,
      templateName: tpl.name,
      title: tpl.title,
      subtitle: tpl.subtitle,
      preamble: tpl.preamble,
      amountMode: tpl.amountMode,
      durationUnit: tpl.durationUnit,
      durationValue: tpl.durationValue ? String(tpl.durationValue) : "",
      sections: asSections(tpl.sections),
      services: asServices(tpl.services),
      definitions: asDefs(tpl.definitions),
    };
  }
  if (searchParams.client) {
    const snap = await clientSnapshot(Number(searchParams.client));
    if (snap) state = { ...state, ...snap, clientId: String(snap.clientId) };
  }
  if (searchParams.projet) state = { ...state, projectId: searchParams.projet };
  if (searchParams.devis) {
    const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, Number(searchParams.devis)));
    if (q && q.status === "accepte") {
      const snap = await clientSnapshot(q.clientId);
      const items = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, q.id)).orderBy(asc(schema.quoteItems.position));
      state = {
        ...state,
        ...(snap ?? {}),
        clientId: String(q.clientId),
        projectId: q.projectId ? String(q.projectId) : state.projectId,
        quoteId: String(q.id),
        amountMode: "flat",
        totalAmount: String(q.total),
        title: q.subject,
        services: items.map((it) => ({
          prestation: it.designation,
          contenu: it.description ?? "",
          volume: `${it.quantity} ${it.unit ?? ""}`.trim(),
        })),
      };
    }
  }
  return (
    <>
      <PageHeader
        title="Nouveau contrat"
        subtitle={<>{tpl ? <>Modèle : <b>{tpl.name}</b></> : "Sans modèle"} · le numéro PN-CTR est attribué à l’enregistrement. <Link href={href(searchParams, { modele: undefined })} className="link">Changer de modèle</Link></>}
        back={{ href: "/contrats", label: "Contrats" }}
      />
      <Flash tone="error" message={searchParams.e === "client" ? "Indiquez le nom du client." : ""} clear={["e"]} />
      <ContractEditor
        action={saveContract.bind(null, null)}
        initial={state}
        clients={ctx.clients}
        projects={ctx.projects}
        quotes={ctx.quotes}
        catalog={ctx.catalog}
        clauses={ctx.clauses.map((c) => ({ key: c.key, kind: c.kind, title: c.title, blocks: (Array.isArray(c.blocks) ? c.blocks : []) as Block[] }))}
        templates={ctx.templates.map((t) => ({ id: t.id, name: t.name, sections: asSections(t.sections) }))}
        missing={[]}
      />
    </>
  );
}
