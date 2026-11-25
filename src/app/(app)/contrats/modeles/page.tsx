import Link from "next/link";
import { CalendarDays, FilePlus2, FileText, ListOrdered, Pencil, Plus, Wallet } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { PageHeader, SectionCard } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { asSections, loadClauses, loadTemplates } from "@/lib/contractData";
import { deleteTemplate } from "../actions";

export default async function ModelsPage({ searchParams }: { searchParams: { ok?: string } }) {
  await requirePerm("contrats", "write");
  const [templates, clauses] = await Promise.all([loadTemplates(), loadClauses()]);
  const articles = clauses.filter((c) => c.kind !== "annex");
  const annexes = clauses.filter((c) => c.kind === "annex");
  return (
    <>
      <PageHeader
        title="Modèles et bibliothèque"
        subtitle="Un contrat déjà créé n’est pas modifié quand un modèle ou la bibliothèque change."
        back={{ href: "/contrats", label: "Contrats" }}
        actions={<Link href="/contrats/modeles/nouveau" className="btn-primary"><Plus size={16} /> Nouveau modèle</Link>}
      />
      <Flash message={searchParams.ok === "article" ? "Article enregistré." : searchParams.ok ? "Modèle enregistré." : ""} clear={["ok"]} />

      <p className="h-section mb-3">Modèles de contrat ({templates.length})</p>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const secs = asSections(t.sections);
          return (
            <div key={t.id} className="card flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${secs.length ? "bg-navy text-white" : "bg-navy-50 text-navy-600"}`}>
                  {secs.length ? <FileText size={18} /> : <FilePlus2 size={18} />}
                </span>
                <div className="min-w-0">
                  <Link href={`/contrats/modeles/${t.id}`} className="font-bold leading-snug text-navy hover:text-gold-600">{t.name}</Link>
                  {t.description && <p className="mt-1 text-sm text-navy-600/80">{t.description}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className={t.amountMode === "monthly" ? "badge-gold" : "badge-blue"}><Wallet size={12} /> {t.amountMode === "monthly" ? "Mensuel" : "Montant unique"}</span>
                <span className="badge-gray"><CalendarDays size={12} /> {t.durationUnit === "end" || !t.durationValue ? "Durée libre" : `${t.durationValue} ${t.durationUnit === "days" ? "jours" : "mois"}`}</span>
                <span className="badge-gray"><ListOrdered size={12} /> {secs.length} article{secs.length > 1 ? "s" : ""}</span>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <Link href={`/contrats/nouveau?modele=${t.id}`} className="btn-primary btn-sm">Utiliser</Link>
                <Link href={`/contrats/modeles/${t.id}`} className="btn-ghost btn-sm"><Pencil size={13} /> Modifier</Link>
                <form action={deleteTemplate.bind(null, t.id)} className="ml-auto">
                  <ConfirmButton message={`Supprimer le modèle « ${t.name} » ? Les contrats déjà créés ne changent pas.`} className="btn-ghost btn-sm text-red-700">Supprimer</ConfirmButton>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {[["Bibliothèque d’articles", articles], ["Annexes", annexes]].map(([title, list]) => (
          <SectionCard key={title as string} title={`${title} (${(list as typeof clauses).length})`} flush>
            <ul className="divide-y divide-navy-100/70">
              {(list as typeof clauses).map((c) => (
                <li key={c.id}>
                  <Link href={`/contrats/modeles/article/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 transition hover:bg-gold/10 sm:px-6">
                    <span className="min-w-0 truncate font-bold text-navy-700">{c.title}</span>
                    <Pencil size={14} className="shrink-0 text-navy-600/50" />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
