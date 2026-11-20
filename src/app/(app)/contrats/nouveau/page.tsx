import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ContractEditor, type EditorState } from "../ContractEditor";
import { editorContext, emptyState } from "../loadEditor";
import { saveContract } from "../actions";
import { asDefs, asSections, asServices, clientSnapshot } from "@/lib/contractData";

export default async function NewContractPage({ searchParams }: { searchParams: { modele?: string; client?: string; projet?: string; devis?: string; e?: string } }) {
  await requirePerm("contrats", "write");
  const ctx = await editorContext();
  let state: EditorState = emptyState(ctx.settings);
  const tpl = ctx.templates.find((t) => String(t.id) === searchParams.modele) ?? ctx.templates[0];
  if (tpl && searchParams.modele !== "0") {
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
      <PageHeader title="Nouveau contrat" subtitle="Le numéro est attribué au premier enregistrement." back={{ href: "/contrats", label: "Contrats" }} />
      {!searchParams.modele && (
        <div className="card card-pad mb-4">
          <p className="h-section">Modèle de départ</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {ctx.templates.map((t) => (
              <a key={t.id} className="btn-ghost btn-sm" href={`/contrats/nouveau?modele=${t.id}${searchParams.client ? `&client=${searchParams.client}` : ""}${searchParams.projet ? `&projet=${searchParams.projet}` : ""}${searchParams.devis ? `&devis=${searchParams.devis}` : ""}`}>{t.name}</a>
            ))}
            <a className="btn-ghost btn-sm" href="/contrats/nouveau?modele=0">Sans modèle</a>
          </div>
        </div>
      )}
      <Flash tone="error" message={searchParams.e === "client" ? "Indiquez le nom du client." : ""} clear={["e"]} />
      {(searchParams.modele || searchParams.devis || searchParams.client) && (
        <ContractEditor
          action={saveContract.bind(null, null)}
          initial={state}
          clients={ctx.clients}
          projects={ctx.projects}
          quotes={ctx.quotes}
          catalog={ctx.catalog}
          clauses={ctx.clauses.map((c) => ({ key: c.key, kind: c.kind, title: c.title, blocks: asSections([{ key: "a", kind: "article", title: "", blocks: c.blocks as never }])[0].blocks }))}
          missing={[]}
        />
      )}
    </>
  );
}
