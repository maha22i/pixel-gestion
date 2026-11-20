import { requirePerm, can } from "@/lib/auth";
import { editorData } from "@/lib/docdata";
import { getSettings } from "@/lib/settings";
import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/DocEditor";
import { createQuote } from "../actions";

export default async function NewQuote({ searchParams }: { searchParams: { client?: string; projet?: string } }) {
  const user = await requirePerm("devis", "write");
  const data = await editorData();
  const st = await getSettings();
  const d = today();
  const projectId = Number(searchParams.projet) || null;
  const project = data.projects.find((p) => p.id === projectId);
  return (
    <>
      <PageHeader title="Nouveau devis" subtitle="Le numéro est attribué à l'enregistrement." back={{ href: "/devis", label: "Devis" }} />
      <DocEditor
        mode="devis"
        action={createQuote}
        {...data}
        submitLabel="Créer le devis"
        newClientHref={can(user, "clients", "write") ? "/clients/nouveau?back=/devis/nouveau" : undefined}
        initial={{
          clientId: Number(searchParams.client) || project?.clientId || null,
          projectId,
          subject: project ? project.title : "",
          issueDate: d,
          validUntil: addDays(d, st.quoteValidityDays),
          discount: 0,
          depositPercent: 50,
          notes: "",
          lines: [],
        }}
      />
    </>
  );
}
