import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { toDoc } from "@/lib/contractData";
import { collectMissing } from "@/lib/contractModel";
import { ContractEditor } from "../../ContractEditor";
import { editorContext, stateFromRow } from "../../loadEditor";
import { refreshClient, saveContract } from "../../actions";
import type { Block } from "@/lib/contractModel";

export default async function EditContractPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string } }) {
  await requirePerm("contrats", "write");
  const id = Number(params.id);
  const [c] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, id));
  if (!c) notFound();
  const ctx = await editorContext();
  const company = await getSettings();
  const missing = collectMissing(toDoc(c), company);
  const open = c.status === "brouillon" || c.status === "envoye";
  return (
    <>
      <PageHeader title={`Modifier ${c.number}`} subtitle={c.templateName ?? ""} back={{ href: `/contrats/${id}`, label: "Contrat" }}
        actions={open && c.clientId ? (
          <form action={refreshClient.bind(null, id)}><button className="btn-ghost">Mettre à jour depuis la fiche client</button></form>
        ) : undefined}
      />
      <Flash message={searchParams.ok === "client" ? "Informations reprises de la fiche client." : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e === "client" ? "Indiquez le nom du client." : ""} clear={["e"]} />
      <ContractEditor
        action={saveContract.bind(null, id)}
        initial={stateFromRow(c)}
        clients={ctx.clients}
        projects={ctx.projects}
        quotes={ctx.quotes}
        catalog={ctx.catalog}
        clauses={ctx.clauses.map((cl) => ({ key: cl.key, kind: cl.kind, title: cl.title, blocks: (Array.isArray(cl.blocks) ? cl.blocks : []) as Block[] }))}
        missing={missing}
        contractId={id}
      />
    </>
  );
}
