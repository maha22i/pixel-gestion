import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { ITEM_KINDS, fdj } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { CatalogTabs } from "./Tabs";
import { ItemForm } from "./ItemForm";
import { createItem } from "./actions";

export default async function CataloguePage({ searchParams }: { searchParams: { q?: string; kind?: string; cat?: string; ok?: string } }) {
  const user = await requirePerm("catalogue");
  const write = can(user, "catalogue", "write");
  const all = await db.select().from(schema.catalogItems).orderBy(asc(schema.catalogItems.category), asc(schema.catalogItems.name));
  const categories = Array.from(new Set(all.map((i) => i.category).filter(Boolean))) as string[];
  const q = (searchParams.q ?? "").toLowerCase();
  const items = all.filter((i) =>
    (!searchParams.kind || i.kind === searchParams.kind) &&
    (!searchParams.cat || i.category === searchParams.cat) &&
    (!q || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q))
  );
  return (
    <>
      <PageHeader title="Catalogue" subtitle="Services et produits utilisés pour construire les devis." />
      <CatalogTabs active="items" />
      <Flash message={searchParams.ok ? "Catalogue mis à jour." : ""} clear={["ok"]} />
      <div className={`grid gap-6 items-start ${write ? "xl:grid-cols-[1fr_360px]" : ""}`}>
        <div>
          <form className="flex flex-wrap gap-2 mb-4">
            <input name="q" defaultValue={searchParams.q} placeholder="Rechercher…" className="input max-w-xs" />
            <select name="kind" defaultValue={searchParams.kind ?? ""} className="input w-auto">
              <option value="">Services et produits</option>
              {Object.entries(ITEM_KINDS).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
            </select>
            <select name="cat" defaultValue={searchParams.cat ?? ""} className="input w-auto">
              <option value="">Toutes catégories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn-ghost">Filtrer</button>
          </form>
          <div className="card overflow-x-auto">
            {items.length === 0 ? <Empty title="Catalogue vide">Ajoutez vos services (couverture vidéo, drone, photo…) et produits (album, clé USB…).</Empty> : (
              <table className="table">
                <thead><tr><th>Élément</th><th>Type</th><th>Catégorie</th><th className="num">Prix</th><th></th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className={i.active ? "clickable" : "clickable opacity-50"}>
                      <td>
                        {write ? <Link href={`/catalogue/${i.id}`} className="link row-hit">{i.name}</Link> : <span className="font-bold">{i.name}</span>}
                        {i.description && <div className="text-sm text-navy-600/70 line-clamp-1">{i.description}</div>}
                      </td>
                      <td><span className={i.kind === "service" ? "badge-blue" : "badge-gold"}>{ITEM_KINDS[i.kind]}</span></td>
                      <td className="text-navy-600">{i.category ?? "—"}</td>
                      <td className="num font-bold">{fdj(i.unitPrice)}<span className="font-normal text-navy-600/60"> / {i.unit}</span></td>
                      <td>{!i.active && <span className="badge-gray">Archivé</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        {write && (
          <aside className="card card-pad xl:sticky xl:top-6">
            <p className="h-section mb-3">Nouvel élément</p>
            <ItemForm action={createItem} categories={categories} />
          </aside>
        )}
      </div>
    </>
  );
}
