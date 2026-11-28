import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { Archive, ArchiveRestore, Clapperboard, Package, Pencil, Search } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { ITEM_KINDS, fdj } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { AutoFilter, FilterPending } from "../projets/AutoFilter";
import { CatalogTabs } from "./Tabs";
import { NewItemButton } from "./NewItemButton";
import { createItem, toggleItemActive } from "./actions";

type SP = { q?: string; kind?: string; cat?: string; etat?: string; ok?: string; archive?: string; nouveau?: string };
type Item = typeof schema.catalogItems.$inferSelect;

const NO_CAT = "Sans catégorie";

export default async function CataloguePage({ searchParams }: { searchParams: SP }) {
  const user = await requirePerm("catalogue");
  const write = can(user, "catalogue", "write");
  const all = await db.select().from(schema.catalogItems).orderBy(asc(schema.catalogItems.category), asc(schema.catalogItems.name));
  const [{ n: eventCount }] = (await db.execute(sql`SELECT count(*)::int AS n FROM event_types`)).rows as { n: number }[];
  const categories = Array.from(new Set(all.map((i) => i.category).filter(Boolean))) as string[];

  const q = (searchParams.q ?? "").trim().toLowerCase();
  const kind = searchParams.kind && searchParams.kind in ITEM_KINDS ? searchParams.kind : "";
  const cat = searchParams.cat ?? "";
  const etat = searchParams.etat === "actif" || searchParams.etat === "archive" ? searchParams.etat : "";
  const filtered = Boolean(q || kind || cat || etat);

  const items = all.filter((i) =>
    (!kind || i.kind === kind) &&
    (!cat || (cat === NO_CAT ? !i.category : i.category === cat)) &&
    (!etat || (etat === "actif" ? i.active : !i.active)) &&
    (!q || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q))
  );

  // Regroupement par catégorie (« Sans catégorie » en dernier), éléments actifs d'abord.
  const groups = new Map<string, Item[]>();
  for (const i of items) {
    const key = i.category || NO_CAT;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const ordered = [...groups.entries()]
    .sort(([a], [b]) => (a === NO_CAT ? 1 : b === NO_CAT ? -1 : a.localeCompare(b, "fr")))
    .map(([name, list]) => [name, list.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "fr"))] as const);

  const activeCount = all.filter((i) => i.active).length;
  const services = all.filter((i) => i.kind === "service").length;
  const keep = new URLSearchParams(Object.entries({ q: searchParams.q ?? "", kind, cat, etat }).filter(([, v]) => v)).toString();
  const back = keep ? `/catalogue?${keep}` : "/catalogue";

  return (
    <>
      <PageHeader
        title="Catalogue"
        subtitle="Services et produits utilisés pour construire les devis."
        actions={write && all.length > 0 && <NewItemButton action={createItem} categories={categories} autoOpen={searchParams.nouveau === "1"} />}
      />
      <CatalogTabs active="items" counts={{ items: all.length, events: eventCount }} />
      <Flash message={searchParams.ok ? "Catalogue mis à jour." : searchParams.archive ? "Élément archivé : il n'est plus proposé dans les devis." : ""} clear={["ok", "archive"]} />

      {all.length === 0 ? (
        <div className="card">
          <Empty title="Votre catalogue est vide">
            Ajoutez vos services (couverture vidéo, drone, photo…) et produits (album, clé USB…) : ils seront proposés en un clic dans les devis.
            {write && <div className="mt-5 flex justify-center"><NewItemButton action={createItem} categories={categories} label="Ajouter un premier élément" autoOpen={searchParams.nouveau === "1"} /></div>}
          </Empty>
        </div>
      ) : (
        <>
          <AutoFilter className="card mb-6 flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-600/50" aria-hidden />
              <input type="search" name="q" defaultValue={searchParams.q} placeholder="Rechercher un service, un produit…" className="input pl-9" aria-label="Rechercher" />
            </div>
            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
              <fieldset className="col-span-2 grid grid-cols-3 rounded-xl border border-navy-200 bg-navy-50/60 p-1 sm:inline-flex" aria-label="Type">
                {[["", "Tous"], ["service", "Services"], ["produit", "Produits"]].map(([k, v]) => (
                  <label key={k} className="cursor-pointer">
                    <input type="radio" name="kind" value={k} defaultChecked={kind === k} className="peer sr-only" />
                    <span className="block rounded-lg px-3 py-1.5 text-center text-[13px] font-bold text-navy-600/75 transition peer-checked:bg-white peer-checked:text-navy peer-checked:ring-1 peer-checked:ring-navy-100 peer-focus-visible:ring-2 peer-focus-visible:ring-gold">{v}</span>
                  </label>
                ))}
              </fieldset>
              <select name="cat" defaultValue={cat} className="input sm:w-auto sm:min-w-[10rem]" aria-label="Catégorie">
                <option value="">Toutes catégories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                {all.some((i) => !i.category) && <option value={NO_CAT}>{NO_CAT}</option>}
              </select>
              <select name="etat" defaultValue={etat} className="input sm:w-auto" aria-label="État">
                <option value="">Actifs et archivés</option>
                <option value="actif">Actifs seulement</option>
                <option value="archive">Archivés seulement</option>
              </select>
              <FilterPending />
            </div>
          </AutoFilter>

          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-600/80">
            <span><b className="text-navy">{items.length}</b> élément{items.length > 1 ? "s" : ""}{filtered && ` sur ${all.length}`}</span>
            <span className="hidden sm:inline">·</span>
            <span>{services} service{services > 1 ? "s" : ""}, {all.length - services} produit{all.length - services > 1 ? "s" : ""}</span>
            <span className="hidden sm:inline">·</span>
            <span>{activeCount} actif{activeCount > 1 ? "s" : ""}{all.length - activeCount > 0 && `, ${all.length - activeCount} archivé${all.length - activeCount > 1 ? "s" : ""}`}</span>
            {filtered && <Link href="/catalogue" className="link ml-auto">Effacer les filtres</Link>}
          </div>

          {items.length === 0 ? (
            <div className="card">
              <Empty title="Aucun élément ne correspond">
                Essayez un autre mot-clé ou <Link href="/catalogue" className="link">affichez tout le catalogue</Link>.
              </Empty>
            </div>
          ) : (
            <div className="space-y-8">
              {ordered.map(([name, list]) => {
                const prices = list.filter((i) => i.active).map((i) => i.unitPrice);
                return (
                  <section key={name} aria-labelledby={`cat-${name}`}>
                    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 id={`cat-${name}`} className="text-lg font-bold text-navy">{name}</h2>
                      <span className="text-sm text-navy-600/70">
                        {list.length} élément{list.length > 1 ? "s" : ""}
                        {prices.length > 1 && ` · de ${fdj(Math.min(...prices))} à ${fdj(Math.max(...prices))}`}
                      </span>
                      <span className="h-px flex-1 self-center bg-gradient-to-r from-gold/40 to-transparent" aria-hidden />
                    </div>
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {list.map((i) => <ItemCard key={i.id} item={i} write={write} back={back} />)}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

function ItemCard({ item: i, write, back }: { item: Item; write: boolean; back: string }) {
  const service = i.kind === "service";
  return (
    <li
      className={`group relative flex flex-col rounded-xl border p-4 transition-colors sm:p-5 ${
        i.active
          ? "border-navy-100 bg-white hover:border-gold/70"
          : "border-dashed border-navy-200 bg-navy-50/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${!i.active ? "bg-navy-100 text-navy-600/60" : service ? "bg-sky-50 text-sky-700" : "bg-gold-100 text-amber-800"}`} aria-hidden>
          {service ? <Clapperboard size={18} /> : <Package size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`font-bold leading-snug ${i.active ? "text-navy" : "text-navy-600/70"}`}>
            {write ? (
              <Link href={`/catalogue/${i.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-gold group-hover:text-navy-800">
                {i.name}
              </Link>
            ) : i.name}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className={!i.active ? "badge-gray" : service ? "badge-blue" : "badge-gold"}>{ITEM_KINDS[i.kind] ?? i.kind}</span>
            {!i.active && <span className="badge-gray"><Archive size={11} aria-hidden /> Archivé · hors devis</span>}
          </div>
        </div>
        {write && <Pencil size={15} className="mt-1 shrink-0 text-navy-600/30 transition group-hover:text-gold-600" aria-hidden />}
      </div>
      <p className={`mt-3 line-clamp-2 min-h-[2.5rem] text-sm ${i.description ? "text-navy-600/80" : "italic text-navy-600/45"}`}>
        {i.description || "Pas de description"}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-navy-100/70 pt-3">
        <p className="min-w-0">
          <span className={`text-[1.35rem] font-bold leading-none tabular-nums ${i.active ? "text-navy" : "text-navy-600/60 line-through decoration-navy-200"}`}>{fdj(i.unitPrice)}</span>
          <span className="ml-1 text-sm text-navy-600/65">/ {i.unit}</span>
        </p>
        {write && (
          <form action={toggleItemActive.bind(null, i.id, back)} className="relative z-10 shrink-0">
            <button className="btn-ghost btn-sm" title={i.active ? "Ne plus proposer dans les devis" : "Proposer à nouveau dans les devis"}>
              {i.active ? <><Archive size={13} aria-hidden /> Archiver</> : <><ArchiveRestore size={13} aria-hidden /> Réactiver</>}
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
