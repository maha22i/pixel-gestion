import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { asDefs, asSections, asServices } from "@/lib/contractData";
import type { Block } from "@/lib/contractModel";
import { ContractEditor } from "../../ContractEditor";
import { editorContext, emptyState } from "../../loadEditor";
import { saveTemplate } from "../../actions";

export default async function TemplateEditPage({ params }: { params: { id: string } }) {
  await requirePerm("contrats", "write");
  const creating = params.id === "nouveau";
  const ctx = await editorContext();
  const base = emptyState(ctx.settings);
  let initial = { ...base, templateName: "Nouveau modèle" };
  let id: number | null = null;
  let description = "";
  if (!creating) {
    const [t] = await db.select().from(schema.contractTemplates).where(eq(schema.contractTemplates.id, Number(params.id)));
    if (!t) notFound();
    id = t.id;
    description = t.description ?? "";
    initial = {
      ...base,
      templateName: t.name,
      title: t.title,
      subtitle: t.subtitle,
      preamble: t.preamble,
      amountMode: t.amountMode,
      durationUnit: t.durationUnit,
      durationValue: t.durationValue ? String(t.durationValue) : "",
      sections: asSections(t.sections),
      services: asServices(t.services),
      definitions: asDefs(t.definitions),
    };
  }
  return (
    <>
      <PageHeader title={creating ? "Nouveau modèle" : initial.templateName} subtitle="Un modèle fixe l’intitulé, les prestations, la durée par défaut et les articles proposés à la création d’un contrat." back={{ href: "/contrats/modeles", label: "Modèles" }} />
      <ContractEditor
        asTemplate
        action={saveTemplate.bind(null, id)}
        initial={initial}
        clients={ctx.clients}
        projects={ctx.projects}
        quotes={ctx.quotes}
        catalog={ctx.catalog}
        clauses={ctx.clauses.map((cl) => ({ key: cl.key, kind: cl.kind, title: cl.title, blocks: (Array.isArray(cl.blocks) ? cl.blocks : []) as Block[] }))}
        missing={[]}
        templateMeta={{ name: initial.templateName, description }}
        cancelHref="/contrats/modeles"
      />
    </>
  );
}
