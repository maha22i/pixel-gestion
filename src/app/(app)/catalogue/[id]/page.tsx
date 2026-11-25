import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { Clapperboard, Package } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { ITEM_KINDS, dateFr, fdj } from "@/lib/format";
import { PageHeader, SectionCard } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ItemForm } from "../ItemForm";
import { deleteItem, updateItem } from "../actions";

export default async function EditItem({ params }: { params: { id: string } }) {
  await requirePerm("catalogue", "write");
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  const [item] = await db.select().from(schema.catalogItems).where(eq(schema.catalogItems.id, id));
  if (!item) notFound();
  const cats = await db.selectDistinct({ c: schema.catalogItems.category }).from(schema.catalogItems);
  const usage = (await db.execute(sql`
    SELECT
      (SELECT count(DISTINCT qi.quote_id) FROM quote_items qi WHERE qi.catalog_item_id = ${id})::int AS quotes,
      (SELECT count(DISTINCT ii.invoice_id) FROM invoice_items ii WHERE ii.catalog_item_id = ${id})::int AS invoices,
      (SELECT max(q.issue_date)::text FROM quote_items qi JOIN quotes q ON q.id = qi.quote_id WHERE qi.catalog_item_id = ${id}) AS last_used
  `)).rows[0] as { quotes: number; invoices: number; last_used: string | null };
  const service = item.kind === "service";

  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className={service ? "badge-blue" : "badge-gold"}>{ITEM_KINDS[item.kind] ?? item.kind}</span>
            {item.category && <span className="badge-gray">{item.category}</span>}
            {item.active ? <span className="badge-green">Actif · proposé dans les devis</span> : <span className="badge-gray">Archivé</span>}
          </span>
        }
        back={{ href: "/catalogue", label: "Catalogue" }}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card card-pad">
          <ItemForm
            action={updateItem.bind(null, id)}
            item={item}
            categories={cats.map((c) => c.c).filter(Boolean) as string[]}
            cancel={<Link href="/catalogue" className="btn-ghost">Annuler</Link>}
          />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6">
          <SectionCard title="Aperçu sur un devis">
            <div className="rounded-xl border border-gold/30 bg-gold-50/40 p-4">
              <div className="flex items-start gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${service ? "bg-sky-50 text-sky-700" : "bg-gold-100 text-amber-800"}`} aria-hidden>
                  {service ? <Clapperboard size={16} /> : <Package size={16} />}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-navy">{item.name}</p>
                  {item.description && <p className="mt-0.5 text-sm text-navy-600/80">{item.description}</p>}
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-gold/25 pt-3 text-sm text-navy-600/80">
                <span>1 {item.unit}</span>
                <span className="text-lg font-bold tabular-nums text-navy">{fdj(item.unitPrice)}</span>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Utilisation">
            {usage.quotes + usage.invoices === 0 ? (
              <p className="text-sm text-navy-600/80">Pas encore utilisé dans un devis ou une facture.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-navy-600/70">Devis</dt><dd className="text-xl font-bold tabular-nums text-navy">{usage.quotes}</dd></div>
                <div><dt className="text-navy-600/70">Factures</dt><dd className="text-xl font-bold tabular-nums text-navy">{usage.invoices}</dd></div>
                {usage.last_used && <div className="col-span-2"><dt className="text-navy-600/70">Dernier devis</dt><dd className="font-bold text-navy">{dateFr(usage.last_used)}</dd></div>}
              </dl>
            )}
          </SectionCard>
          <div className="rounded-2xl border border-red-100 bg-red-50/40 p-5">
            <p className="font-bold text-red-800">Supprimer l'élément</p>
            <p className="mb-3 mt-1 text-sm text-navy-600/80">
              Les devis et factures existants gardent leurs lignes. Pour simplement ne plus le proposer, préférez décocher « Actif ».
            </p>
            <form action={deleteItem.bind(null, id)}>
              <ConfirmButton message="Supprimer cet élément ? Les devis existants gardent leurs lignes. (Préférez « Archiver » en décochant Actif.)">Supprimer définitivement</ConfirmButton>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
