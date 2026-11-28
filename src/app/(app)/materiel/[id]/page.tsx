import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { ArrowLeft, Trash2 } from "lucide-react";
import { db, schema } from "@/db";
import { can, requirePerm } from "@/lib/auth";
import { AVAILABILITY, CONDITIONS, seesPrices } from "@/lib/equipment";
import { qtyAvailable } from "@/lib/equipmentSlips";
import { dateFr, fdj, today } from "@/lib/format";
import { Field } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { addMaintenance, deleteEquipment, deleteEquipmentFile, reportBreakdown, updateEquipment } from "../actions";

export default async function EquipmentPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string } }) {
  const user = await requirePerm("materiel");
  const id = Number(params.id);
  const [item] = await db.select().from(schema.equipment).where(eq(schema.equipment.id, id));
  if (!item) notFound();
  const write = can(user, "materiel", "write");
  const prices = seesPrices(user);
  const canExpense = can(user, "depenses", "write");
  const categories = await db.select().from(schema.equipmentCategories).orderBy(asc(schema.equipmentCategories.position));
  const locations = await db.select().from(schema.equipmentLocations).orderBy(asc(schema.equipmentLocations.position));
  const files = await db.select().from(schema.equipmentFiles).where(eq(schema.equipmentFiles.equipmentId, id));
  const events = await db.select().from(schema.equipmentEvents).where(eq(schema.equipmentEvents.equipmentId, id)).orderBy(asc(schema.equipmentEvents.id));
  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  const projects = await db.select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects).orderBy(asc(schema.projects.title));
  const roots = categories.filter((c) => !c.parentId);
  const cat = categories.find((c) => c.id === item.categoryId);
  const parent = categories.find((c) => c.id === cat?.parentId);
  const catLabel = cat ? (parent ? `${parent.name} › ${cat.name}` : cat.name) : "—";
  const who = (uid: number | null) => users.find((u) => u.id === uid)?.name ?? "—";
  const project = (pid: number | null) => projects.find((p) => p.id === pid)?.title;
  const photos = files.filter((f) => f.kind === "photo");
  const available = await qtyAvailable(id, item.quantity);
  const openSlips = await db.execute(sql`
    SELECT s.id, s.number, s.status, s.location, s.expected_return_at, i.quantity, p.title AS project_title
    FROM equipment_slip_items i
    JOIN equipment_slips s ON s.id = i.slip_id
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE i.equipment_id = ${id}
      AND (
        s.status IN ('sorti', 'attente_controle')
        OR (s.status = 'cloture_anomalies' AND (i.returned IS NULL OR i.returned = 'non' OR (i.returned = 'partiel' AND COALESCE(i.qty_returned,0) < i.quantity)))
      )
    ORDER BY s.out_at DESC`);
  const openRows = openSlips.rows as Record<string, unknown>[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/materiel" className="btn-ghost h-11 px-4 text-sm">
          <ArrowLeft size={16} /> Retour à la liste
        </Link>
        {write && (
          <form action={deleteEquipment.bind(null, id)}>
            <ConfirmButton
              message="Supprimer ce matériel et son historique ?"
              className="btn-danger h-11 px-4 text-sm"
            >
              <Trash2 size={16} /> Supprimer
            </ConfirmButton>
          </form>
        )}
      </div>

      <section className="card p-4 sm:p-5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-navy">{item.name}</h1>
        <p className="mt-1 text-sm text-navy-600/80">{item.ref} · {catLabel}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="badge-navy">{item.ref}</span>
          <span className="badge-gray">Qté {item.quantity} · dispo {available}</span>
          <span className={item.condition === "en_panne" ? "badge-red" : "badge-gray"}>{CONDITIONS[item.condition] ?? item.condition}</span>
          <span className={item.availability === "en_utilisation" ? "badge-gold" : "badge-green"}>{AVAILABILITY[item.availability] ?? item.availability}</span>
          <span className="badge-gray">{locations.find((l) => l.id === item.locationId)?.name ?? "Sans emplacement"}</span>
        </div>
      </section>

      <Flash className="mb-0" message={searchParams.ok ? "Enregistré." : ""} clear={["ok"]} />
      <Flash className="mb-0" tone="error" message={searchParams.err ? "Action impossible dans l'état actuel." : ""} clear={["err"]} />

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {photos.map((f) => (
            <div key={f.id} className="relative">
              <img src={`/api/fichiers/materiel/${f.id}`} alt={f.filename} className="h-32 w-44 rounded-xl object-cover ring-1 ring-navy-100/70" />
              {write && <form action={deleteEquipmentFile.bind(null, f.id)} className="mt-1"><button className="text-xs font-bold text-red-700">Retirer</button></form>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card card-pad space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="h-section">Où est-il ?</p>
            {write && <Link className="btn-ghost btn-sm" href="/materiel/sorties/nouveau">Nouveau bon de sortie</Link>}
          </div>
          {openRows.length === 0 ? (
            <p className="text-sm text-navy-600/80">Aucune sortie ouverte — {available}/{item.quantity} disponible(s).</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {openRows.map((r) => (
                <li key={String(r.id)} className="rounded-xl border border-navy-100 bg-navy-50/40 px-3 py-2">
                  <Link className="font-bold text-navy hover:text-gold-600" href={`/materiel/sorties/${r.id}`}>{String(r.number)}</Link>
                  {" · "}qté {String(r.quantity)}
                  {r.project_title ? ` · ${String(r.project_title)}` : ""}
                  {r.location ? ` · ${String(r.location)}` : ""}
                  <div className="text-navy-600/70">Retour prévu {dateFr(String(r.expected_return_at).slice(0, 10))}</div>
                </li>
              ))}
            </ul>
          )}
          <form action={reportBreakdown.bind(null, id)} className="flex flex-wrap items-end gap-2 border-t border-navy/10 pt-4">
            <Field label="Signaler une panne"><input name="note" className="input" placeholder="Ce qui ne va pas" /></Field>
            <button className="btn-ghost">Mettre en panne</button>
          </form>
        </section>

        {write && (
          <section className="card card-pad">
            <p className="h-section mb-3">Réparation / entretien</p>
            <form action={addMaintenance.bind(null, id)} className="grid gap-3">
              <Field label="Date"><input name="date" type="date" defaultValue={today()} className="input" /></Field>
              <Field label="Description"><input name="note" className="input" required /></Field>
              <Field label="Coût (FDJ)"><input name="cost" className="input" inputMode="numeric" /></Field>
              <Field label="Prestataire"><input name="provider" className="input" /></Field>
              {canExpense && <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="toExpense" value="1" /> Ajouter aux dépenses (catégorie Matériel)</label>}
              <button className="btn-navy w-fit">Enregistrer</button>
            </form>
          </section>
        )}
      </div>

      <section className="card mt-4 overflow-x-auto">
        <p className="h-section px-4 pt-4">Historique</p>
        <table className="table">
          <thead><tr><th>Date</th><th>Type</th><th>Détail</th></tr></thead>
          <tbody>
            {[...events].reverse().map((e) => (
              <tr key={e.id}>
                <td>{dateFr(e.returnDate || e.outDate || e.createdAt)}</td>
                <td>{e.kind === "sortie" ? "Sortie" : e.kind === "retour" ? "Retour" : e.kind === "etat" ? "État" : "Réparation"}</td>
                <td>
                  {e.kind === "sortie" && <>{who(e.userId)}{e.projectId ? ` · ${project(e.projectId)}` : ""} · sortie {dateFr(e.outDate)}{e.expectedReturn ? ` · prévu ${dateFr(e.expectedReturn)}` : ""}{e.slipId ? <> · <Link className="link" href={`/materiel/sorties/${e.slipId}`}>bon</Link></> : null}</>}
                  {e.kind === "retour" && <>Retour {dateFr(e.returnDate)}{e.conditionAfter ? ` · ${CONDITIONS[e.conditionAfter] ?? e.conditionAfter}` : ""}{e.slipId ? <> · <Link className="link" href={`/materiel/sorties/${e.slipId}`}>bon</Link></> : null}</>}
                  {e.kind === "etat" && <>{CONDITIONS[e.conditionAfter ?? ""] ?? e.conditionAfter}</>}
                  {e.kind === "reparation" && <>{e.provider || "Prestataire non précisé"}{prices && e.cost != null ? ` · ${fdj(e.cost)}` : ""}{e.expenseId ? " · envoyé aux dépenses" : ""}</>}
                  {e.note ? <div className="text-navy-600/70">{e.note}</div> : null}
                </td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={3}>Aucun mouvement.</td></tr>}
          </tbody>
        </table>
      </section>

      {write && (
        <form action={updateEquipment.bind(null, id)} className="card card-pad mt-4 grid gap-4 md:grid-cols-2">
          <p className="h-section md:col-span-2">Modifier la fiche</p>
          <Field label="Nom"><input name="name" defaultValue={item.name} className="input" required /></Field>
          <Field label="Catégorie">
            <select name="categoryId" className="input" defaultValue={item.categoryId ?? ""}>
              {roots.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name}</option>
                  {categories.filter((s) => s.parentId === c.id).map((s) => <option key={s.id} value={s.id}>{c.name} › {s.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Marque"><input name="brand" defaultValue={item.brand ?? ""} className="input" /></Field>
          <Field label="Modèle"><input name="model" defaultValue={item.model ?? ""} className="input" /></Field>
          <Field label="N° de série"><input name="serial" defaultValue={item.serialNumber ?? ""} className="input" /></Field>
          <Field label="Quantité"><input name="quantity" type="number" min={1} defaultValue={item.quantity} className="input" /></Field>
          <Field label="Caractéristiques" className="md:col-span-2"><input name="specs" defaultValue={item.specs ?? ""} className="input" /></Field>
          <Field label="Description" className="md:col-span-2"><textarea name="description" defaultValue={item.description ?? ""} className="input" rows={3} /></Field>
          <Field label="Date d'achat"><input name="purchaseDate" type="date" defaultValue={item.purchaseDate ?? ""} className="input" /></Field>
          <Field label="Prix d'achat (FDJ)"><input name="purchasePrice" defaultValue={item.purchasePrice ?? ""} className="input" /></Field>
          <Field label="Fournisseur"><input name="supplier" defaultValue={item.supplier ?? ""} className="input" /></Field>
          <Field label="Fin de garantie"><input name="warrantyEnd" type="date" defaultValue={item.warrantyEnd ?? ""} className="input" /></Field>
          <Field label="Emplacement">
            <select name="locationId" className="input" defaultValue={item.locationId ?? ""}>
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="État">
            <select name="condition" className="input" defaultValue={item.condition}>
              {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Disponibilité">
            <select name="availability" className="input" defaultValue={item.availability}>
              {Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Ajouter une photo"><input name="photo" type="file" accept="image/*" className="input" /></Field>
          <Field label="Ajouter une facture"><input name="invoice" type="file" className="input" /></Field>
          <Field label="Notes" className="md:col-span-2"><textarea name="notes" defaultValue={item.notes ?? ""} className="input" rows={2} /></Field>
          <div><button className="btn-gold">Enregistrer</button></div>
        </form>
      )}
      {!write && (
        <section className="card card-pad mt-4 text-sm">
          <p>{item.brand} {item.model}</p>
          {item.specs && <p className="mt-1">{item.specs}</p>}
          {item.description && <p className="mt-1">{item.description}</p>}
          {item.notes && <p className="mt-1 text-navy-600/80">{item.notes}</p>}
          {item.serialNumber && <p className="mt-1">N° de série {item.serialNumber}</p>}
        </section>
      )}
    </div>
  );
}
