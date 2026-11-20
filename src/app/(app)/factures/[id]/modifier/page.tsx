import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { editorData, rowToLine } from "@/lib/docdata";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/DocEditor";
import { updateInvoice } from "../../actions";

export default async function EditInvoice({ params }: { params: { id: string } }) {
  await requirePerm("factures", "write");
  const id = Number(params.id);
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!inv) notFound();
  const items = await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, id)).orderBy(asc(schema.invoiceItems.position));
  const inst = await db.select().from(schema.installments).where(eq(schema.installments.invoiceId, id)).orderBy(asc(schema.installments.position));
  const data = await editorData();
  const dep = inst.length > 1 && inv.total ? Math.round((inst[0].amount / inv.total) * 100) : 100;
  return (
    <>
      <PageHeader
        title={`Modifier ${inv.number}`}
        subtitle="Si le total change, l'échéancier est ajusté proportionnellement."
        back={{ href: `/factures/${id}`, label: inv.number }}
      />
      <DocEditor
        mode="facture"
        action={updateInvoice.bind(null, id)}
        {...data}
        submitLabel="Enregistrer la facture"
        showDeposit={false}
        initial={{
          clientId: inv.clientId, projectId: inv.projectId, subject: inv.subject, issueDate: inv.issueDate,
          discount: inv.discount, depositPercent: dep, notes: inv.notes ?? "", lines: items.map(rowToLine),
        }}
      />
    </>
  );
}
