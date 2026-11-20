import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { saveClause } from "../../../actions";
import type { Block } from "@/lib/contractModel";

export default async function ClausePage({ params }: { params: { id: string } }) {
  await requirePerm("contrats", "write");
  const [c] = await db.select().from(schema.contractClauses).where(eq(schema.contractClauses.id, Number(params.id)));
  if (!c) notFound();
  const blocks = (Array.isArray(c.blocks) ? c.blocks : []) as Block[];
  const text = blocks.map((b) => {
    if (b.type === "p") return b.text;
    if (b.type === "ul") return b.items.map((i) => `- ${i}`).join("\n");
    if (b.type === "subs") return b.items.map((i) => `§ ${i.text}`).join("\n\n");
    if (b.type === "table") return `[tableau:${b.id}]`;
    return "";
  }).join("\n\n");
  return (
    <>
      <PageHeader title={c.title} subtitle="Le texte enregistré remplace la bibliothèque. Les contrats déjà créés ne changent pas." back={{ href: "/contrats/modeles", label: "Modèles" }} />
      <form action={saveClause.bind(null, c.id)} className="card card-pad space-y-3 max-w-3xl">
        <label className="block">Titre<input name="title" className="input mt-1" defaultValue={c.title} /></label>
        <p className="text-sm text-navy-600">Paragraphes séparés par une ligne vide. Une ligne « - … » est une puce. Une ligne « § … » est un sous-article. Une ligne [tableau:services], [tableau:definitions], [tableau:prices] ou [tableau:custom] insère le tableau.</p>
        <textarea name="source" className="input" rows={18} defaultValue={text} />
        <button className="btn-primary">Enregistrer l’article</button>
      </form>
    </>
  );
}
