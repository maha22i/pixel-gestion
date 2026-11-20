import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { ArrowDown, ArrowUp, FolderTree, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { db, schema } from "@/db";
import { can, requirePerm } from "@/lib/auth";
import { AVAILABILITY, CONDITIONS, seesPrices } from "@/lib/equipment";
import { addDays, fdj, today } from "@/lib/format";
import { Empty, Field, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createCategory, createLocation, deleteCategory, deleteLocation, moveCategory, renameCategory, renameLocation } from "./actions";

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
            {write && <Link className="btn-gold" href="/materiel/nouveau">Ajouter</Link>}
          </>
        }
      />
      <Flash tone="error" clear={["err"]} message={searchParams.err === "cat" ? "Cette catégorie contient du matériel ou une sous-catégorie. Déplacez-les avant de la supprimer." : ""} />
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

      {write && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="card card-pad">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-gold-700"><FolderTree size={16} /></span>
              <div>
                <p className="h-section">Catégories</p>
                <p className="text-xs text-navy-600/70">Organise les familles et sous-familles de matériel.</p>
              </div>
            </div>
            <ul className="space-y-3">
              {roots.map((c) => (
                <li key={c.id} className="rounded-xl border border-navy-100/80 bg-navy-50/35 p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <form action={renameCategory} className="flex min-w-0 flex-1 gap-1.5">
                      <input type="hidden" name="id" value={c.id} />
                      <input name="name" defaultValue={c.name} className="input h-9 min-w-[160px] sm:min-w-[220px]" />
                      <button className="btn-ghost btn-sm"><Pencil size={13} /> Renommer</button>
                    </form>
                    <form action={moveCategory.bind(null, c.id, -1)}><button className="btn-ghost btn-sm px-2.5" title="Monter"><ArrowUp size={13} /></button></form>
                    <form action={moveCategory.bind(null, c.id, 1)}><button className="btn-ghost btn-sm px-2.5" title="Descendre"><ArrowDown size={13} /></button></form>
                    <form action={deleteCategory.bind(null, c.id)}>
                      <ConfirmButton className="btn-danger btn-sm px-2.5" message="Supprimer cette catégorie ?"><Trash2 size={13} /></ConfirmButton>
                    </form>
                  </div>
                  <ul className="ml-4 mt-2.5 space-y-2 border-l border-navy-200/70 pl-3">
                    {categories.filter((s) => s.parentId === c.id).map((s) => (
                      <li key={s.id} className="rounded-lg bg-white/75 p-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                        <form action={renameCategory} className="flex min-w-0 flex-1 gap-1.5">
                          <input type="hidden" name="id" value={s.id} />
                          <input name="name" defaultValue={s.name} className="input h-9 min-w-[150px] sm:min-w-[190px]" />
                          <button className="btn-ghost btn-sm"><Pencil size={13} /> Renommer</button>
                        </form>
                        <form action={moveCategory.bind(null, s.id, -1)}><button className="btn-ghost btn-sm px-2.5" title="Monter"><ArrowUp size={13} /></button></form>
                        <form action={moveCategory.bind(null, s.id, 1)}><button className="btn-ghost btn-sm px-2.5" title="Descendre"><ArrowDown size={13} /></button></form>
                        <form action={deleteCategory.bind(null, s.id)}>
                          <ConfirmButton className="btn-danger btn-sm px-2.5" message="Supprimer cette sous-catégorie ?"><Trash2 size={13} /></ConfirmButton>
                        </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <form action={createCategory} className="mt-4 rounded-xl border border-dashed border-navy-200 bg-white/70 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-navy-600/70">Nouvelle catégorie</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Nom"><input name="name" className="input" required /></Field>
              <Field label="Sous-catégorie de">
                <select name="parentId" className="input" defaultValue="">
                  <option value="">— catégorie principale —</option>
                  {roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <button className="btn-navy self-end"><Plus size={14} /> Créer</button>
              </div>
            </form>
          </section>
          <section className="card card-pad">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy-100/70 text-navy"><MapPin size={16} /></span>
              <div>
                <p className="h-section">Emplacements</p>
                <p className="text-xs text-navy-600/70">Liste des lieux de stockage et d'utilisation.</p>
              </div>
            </div>
            <ul className="space-y-2.5">
              {locations.map((l) => (
                <li key={l.id} className="rounded-xl border border-navy-100/80 bg-navy-50/35 p-2">
                  <form action={renameLocation} className="flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="id" value={l.id} />
                    <input name="name" defaultValue={l.name} className="input h-9 min-w-[200px] sm:min-w-[260px]" />
                    <button className="btn-ghost btn-sm"><Pencil size={13} /> Renommer</button>
                  </form>
                  <form action={deleteLocation.bind(null, l.id)} className="mt-1 sm:mt-0">
                    <ConfirmButton className="btn-danger btn-sm" message="Supprimer cet emplacement ?"><Trash2 size={13} /> Supprimer</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
            <form action={createLocation} className="mt-4 rounded-xl border border-dashed border-navy-200 bg-white/70 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-navy-600/70">Nouvel emplacement</p>
              <div className="flex flex-wrap gap-2">
                <input name="name" className="input min-w-[220px] flex-1" placeholder="Nouvel emplacement" required />
                <button className="btn-navy"><Plus size={14} /> Ajouter</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
