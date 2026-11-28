import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { FolderTree, MapPin, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { can, requirePerm } from "@/lib/auth";
import { AVAILABILITY, CONDITIONS, seesPrices } from "@/lib/equipment";
import { addDays, fdj, today } from "@/lib/format";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { CategoriesModal, LocationsModal } from "./ManageModals";

export default async function MaterielPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requirePerm("materiel");
  const write = can(user, "materiel", "write");
  const prices = seesPrices(user);
  const q = (searchParams.q ?? "").trim();
  const cat = searchParams.cat ?? "";
  const etat = searchParams.etat ?? "";
  const dispo = searchParams.dispo ?? "";
  const lieu = searchParams.lieu ?? "";
  const grouped = searchParams.vue === "groupe";
  const horizon = addDays(today(), 30);

  const res = await db.execute(sql`
    SELECT e.*,
      c.name AS cat_name, c.parent_id,
      ch.name AS parent_name,
      l.name AS location_name,
      (SELECT f.id FROM equipment_files f WHERE f.equipment_id = e.id AND f.kind = 'photo' ORDER BY f.id LIMIT 1) AS photo_id,
      EXISTS (
        SELECT 1 FROM equipment_events ev
        WHERE ev.equipment_id = e.id AND ev.kind = 'sortie' AND ev.return_date IS NULL
          AND ev.expected_return IS NOT NULL AND ev.expected_return < ${today()}::date
      ) AS overdue
    FROM equipment e
    LEFT JOIN equipment_categories c ON c.id = e.category_id
    LEFT JOIN equipment_categories ch ON ch.id = c.parent_id
    LEFT JOIN equipment_locations l ON l.id = e.location_id
    WHERE (${q} = '' OR e.name ILIKE ${"%" + q + "%"} OR e.ref ILIKE ${"%" + q + "%"} OR COALESCE(e.brand,'') ILIKE ${"%" + q + "%"} OR COALESCE(e.model,'') ILIKE ${"%" + q + "%"})
      AND (${cat} = '' OR e.category_id = ${Number(cat) || 0} OR c.parent_id = ${Number(cat) || 0})
      AND (${etat} = '' OR e.condition = ${etat})
      AND (${dispo} = '' OR e.availability = ${dispo})
      AND (${lieu} = '' OR e.location_id = ${Number(lieu) || 0})
    ORDER BY COALESCE(ch.position, c.position), c.position, e.name`);
  const rows = res.rows as Record<string, unknown>[];

  const stats = await db.execute(sql`
    SELECT
      COUNT(*)::int AS n,
      COALESCE(SUM(purchase_price), 0)::int AS valeur,
      COUNT(*) FILTER (WHERE availability = 'en_utilisation')::int AS sorti,
      COUNT(*) FILTER (WHERE condition = 'en_panne')::int AS panne,
      COUNT(*) FILTER (WHERE warranty_end IS NOT NULL AND warranty_end >= ${today()}::date AND warranty_end <= ${horizon}::date)::int AS garanties
    FROM equipment`);
  const st = stats.rows[0] as { n: number; valeur: number; sorti: number; panne: number; garanties: number };
  const late = await db.execute(sql`
    SELECT COUNT(DISTINCT equipment_id)::int AS n FROM equipment_events
    WHERE kind = 'sortie' AND return_date IS NULL AND expected_return IS NOT NULL AND expected_return < ${today()}::date`);
  const retard = Number((late.rows[0] as { n: number }).n);

  const categories = await db.select().from(schema.equipmentCategories).orderBy(asc(schema.equipmentCategories.position), asc(schema.equipmentCategories.id));
  const locations = await db.select().from(schema.equipmentLocations).orderBy(asc(schema.equipmentLocations.position));
  const roots = categories.filter((c) => !c.parentId);
  const usage = (await db.execute(sql`SELECT category_id, location_id, COUNT(*)::int AS n FROM equipment GROUP BY 1, 2`)).rows as { category_id: number | null; location_id: number | null; n: number }[];
  const catCounts = new Map<number, number>();
  const locCounts = new Map<number, number>();
  for (const u of usage) {
    if (u.category_id) catCounts.set(u.category_id, (catCounts.get(u.category_id) ?? 0) + u.n);
    if (u.location_id) locCounts.set(u.location_id, (locCounts.get(u.location_id) ?? 0) + u.n);
  }
  const label = (id: number | null) => {
    const c = categories.find((x) => x.id === id);
    if (!c) return "Sans catégorie";
    const p = categories.find((x) => x.id === c.parentId);
    return p ? `${p.name} › ${c.name}` : c.name;
  };

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = label(r.category_id == null ? null : Number(r.category_id));
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const table = (list: typeof rows) => (
    <table className="table">
      <thead>
        <tr>
          <th></th><th>Réf.</th><th>Nom</th><th>Catégorie</th><th>Qté</th><th>État</th><th>Disponibilité</th><th>Emplacement</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={String(r.id)}>
            <td className="w-14">
              {r.photo_id ? <img src={`/api/fichiers/materiel/${r.photo_id}`} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-navy/5 text-xs text-navy-600">—</span>}
            </td>
            <td className="font-mono text-sm">{String(r.ref)}</td>
            <td><Link className="font-bold text-navy hover:text-gold-600" href={`/materiel/${r.id}`}>{String(r.name)}</Link></td>
            <td>{label(r.category_id == null ? null : Number(r.category_id))}</td>
            <td>{String(r.quantity)}</td>
            <td><span className={r.condition === "en_panne" ? "badge-red" : "badge-gray"}>{CONDITIONS[String(r.condition)] ?? String(r.condition)}</span></td>
            <td>
              <span className={r.availability === "en_utilisation" ? "badge-gold" : r.availability === "en_maintenance" ? "badge-navy" : "badge-green"}>
                {AVAILABILITY[String(r.availability)] ?? String(r.availability)}
              </span>
              {r.overdue ? <span className="badge ml-1 bg-red-600 text-white">Retour en retard</span> : null}
            </td>
            <td>{String(r.location_name ?? "—")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      <PageHeader
        title="Matériel"
        subtitle="Inventaire de Pixel Nomade : audiovisuel, informatique, mobilier."
        actions={
          <>
            <Link className="btn-ghost" href="/materiel/sorties">Sorties de matériel</Link>
            <a className="btn-ghost" href="/api/pdf/materiel">Export PDF</a>
            <a className="btn-ghost" href="/api/materiel/export">Export Excel</a>
            {write && <Link className="btn-ghost" href="/materiel?gerer=categories" scroll={false}><FolderTree size={16} /> Catégories</Link>}
            {write && <Link className="btn-ghost" href="/materiel?gerer=emplacements" scroll={false}><MapPin size={16} /> Emplacements</Link>}
            {write && <Link className="btn-gold" href="/materiel/nouveau"><Plus size={16} /> Ajouter</Link>}
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Équipements" value={st.n} />
        {prices && <Stat label="Valeur d'achat" value={fdj(st.valeur)} tone="gold" />}
        <Stat label="Sorti" value={st.sorti} hint={retard ? `${retard} retour${retard > 1 ? "s" : ""} en retard` : "Aucun retard"} tone={retard ? "red" : "navy"} />
        <Stat label="En panne" value={st.panne} tone={st.panne ? "red" : "navy"} />
        <Stat label="Garanties < 30 j" value={st.garanties} />
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Recherche" className="input w-full sm:w-auto sm:min-w-48" />
        <select name="cat" defaultValue={cat} className="input w-auto">
          <option value="">Toutes catégories</option>
          {roots.map((c) => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.id}>{c.name}</option>
              {categories.filter((s) => s.parentId === c.id).map((s) => <option key={s.id} value={s.id}>{c.name} › {s.name}</option>)}
            </optgroup>
          ))}
        </select>
        <select name="etat" defaultValue={etat} className="input w-auto">
          <option value="">Tous les états</option>
          {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="dispo" defaultValue={dispo} className="input w-auto">
          <option value="">Toutes disponibilités</option>
          {Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="lieu" defaultValue={lieu} className="input w-auto">
          <option value="">Tous les lieux</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {grouped && <input type="hidden" name="vue" value="groupe" />}
        <button className="btn-navy">Filtrer</button>
        <Link className="btn-ghost" href={grouped ? "/materiel" : "/materiel?vue=groupe"}>{grouped ? "Vue liste" : "Grouper par catégorie"}</Link>
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty title="Aucun matériel">Ajustez les filtres ou ajoutez une fiche.</Empty> : grouped
          ? [...groups.entries()].map(([name, list]) => (
            <div key={name}>
              <p className="h-section px-4 pt-4">{name}</p>
              {table(list)}
            </div>
          ))
          : table(rows)}
      </div>

      {write && searchParams.gerer === "categories" && (
        <CategoriesModal categories={categories} counts={catCounts} edit={Number(searchParams.edit) || 0} ok={searchParams.ok} err={searchParams.err} />
      )}
      {write && searchParams.gerer === "emplacements" && (
        <LocationsModal locations={locations} counts={locCounts} edit={Number(searchParams.edit) || 0} ok={searchParams.ok} err={searchParams.err} />
      )}
    </>
  );
}
