import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ItemForm } from "../ItemForm";
import { deleteItem, updateItem } from "../actions";

export default async function EditItem({ params }: { params: { id: string } }) {
  await requirePerm("catalogue", "write");
  const id = Number(params.id);
  const [item] = await db.select().from(schema.catalogItems).where(eq(schema.catalogItems.id, id));
  if (!item) notFound();
  const cats = await db.selectDistinct({ c: schema.catalogItems.category }).from(schema.catalogItems);
  return (
    <>
      <PageHeader
        title={item.name}
        back={{ href: "/catalogue", label: "Catalogue" }}
        actions={
          <form action={deleteItem.bind(null, id)}>
            <ConfirmButton message="Supprimer cet élément ? Les devis existants gardent leurs lignes. (Préférez « Archiver » en décochant Actif.)">Supprimer</ConfirmButton>
          </form>
        }
      />
      <div className="card card-pad max-w-xl">
        <ItemForm action={updateItem.bind(null, id)} item={item} categories={cats.map((c) => c.c).filter(Boolean) as string[]} />
      </div>
    </>
  );
}
