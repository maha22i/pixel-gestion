import { requirePerm, can } from "@/lib/auth";
import { editorData } from "@/lib/docdata";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/DocEditor";
import { createInvoice } from "../actions";

export default async function NewInvoice({ searchParams }: { searchParams: { client?: string } }) {
  const user = await requirePerm("factures", "write");
  const data = await editorData();
  return (
    <>
      <PageHeader title="Nouvelle facture" subtitle="Facture directe, sans passer par un devis." back={{ href: "/factures", label: "Factures" }} />
      <DocEditor
        mode="facture"
        action={createInvoice}
        {...data}
        submitLabel="Créer la facture"
        newClientHref={can(user, "clients", "write") ? "/clients/nouveau?back=/factures/nouveau" : undefined}
        initial={{
          clientId: Number(searchParams.client) || null, projectId: null, subject: "", issueDate: today(),
          discount: 0, depositPercent: 50, notes: "", lines: [],
        }}
      />
    </>
  );
}
