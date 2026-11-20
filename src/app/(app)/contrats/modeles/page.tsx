import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { loadClauses, loadTemplates } from "@/lib/contractData";
import { deleteTemplate } from "../actions";

export default async function ModelsPage({ searchParams }: { searchParams: { ok?: string } }) {
  await requirePerm("contrats", "write");
  const [templates, clauses] = await Promise.all([loadTemplates(), loadClauses()]);
  return (
    <>
      <PageHeader title="Modèles et bibliothèque" subtitle="Réservé à l’écriture sur Contrats. Un contrat déjà créé n’est pas modifié quand la bibliothèque change." back={{ href: "/contrats", label: "Contrats" }}
        actions={<Link href="/contrats/modeles/nouveau" className="btn-primary">+ Modèle</Link>} />
      <Flash message={searchParams.ok ? "Enregistré." : ""} clear={["ok"]} />
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card">
          <p className="h-section px-5 pt-5">Modèles de contrat</p>
          <table className="table"><tbody>
            {templates.map((t) => (
              <tr key={t.id} className="clickable">
                <td><Link className="link row-hit" href={`/contrats/modeles/${t.id}`}>{t.name}</Link><div className="text-sm text-navy-600/70">{t.description}</div></td>
                <td>
                  <form action={deleteTemplate.bind(null, t.id)} className="row-keep"><button className="btn-ghost btn-sm">Supprimer</button></form>
                </td>
              </tr>
            ))}
          </tbody></table>
        </section>
        <section className="card">
          <p className="h-section px-5 pt-5">Bibliothèque d’articles</p>
          <table className="table"><tbody>
            {clauses.map((c) => (
              <tr key={c.id} className="clickable">
                <td><Link className="link row-hit" href={`/contrats/modeles/article/${c.id}`}>{c.kind === "annex" ? "Annexe" : "Article"} — {c.title}</Link></td>
              </tr>
            ))}
          </tbody></table>
        </section>
      </div>
    </>
  );
}
