import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { editorData, rowToLine } from "@/lib/docdata";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/DocEditor";
import { updateQuote } from "../../actions";

export default async function EditQuote({ params }: { params: { id: string } }) {
  await requirePerm("devis", "write");
  const id = Number(params.id);
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
  if (!q) notFound();
  if (q.signedAt) redirect(`/devis/${id}?e=signe`);
  const items = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, id)).orderBy(asc(schema.quoteItems.position));
  const data = await editorData();
  return (
    <>
      <PageHeader title={`Modifier ${q.number}`} back={{ href: `/devis/${id}`, label: q.number }} />
      <DocEditor
        mode="devis"
        action={updateQuote.bind(null, id)}
        {...data}
        submitLabel="Enregistrer le devis"
        initial={{
          clientId: q.clientId, projectId: q.projectId, subject: q.subject, issueDate: q.issueDate, validUntil: q.validUntil,
          discount: q.discount, depositPercent: q.depositPercent, notes: q.notes ?? "", lines: items.map(rowToLine),
        }}
      />
    </>
  );
}
