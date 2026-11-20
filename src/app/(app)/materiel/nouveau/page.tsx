import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { AVAILABILITY, CONDITIONS } from "@/lib/equipment";
import { Field, PageHeader } from "@/components/ui";
import { createEquipment } from "../actions";

export default async function NewEquipmentPage() {
  await requirePerm("materiel", "write");
  const categories = await db.select().from(schema.equipmentCategories).orderBy(asc(schema.equipmentCategories.position));
  const locations = await db.select().from(schema.equipmentLocations).orderBy(asc(schema.equipmentLocations.position));
  const roots = categories.filter((c) => !c.parentId);
  return (
    <>
      <PageHeader title="Nouveau matériel" back={{ href: "/materiel", label: "Matériel" }} />
      <form action={createEquipment} className="card card-pad grid gap-4 md:grid-cols-2">
        <Field label="Nom"><input name="name" className="input" required /></Field>
        <Field label="Catégorie">
          <select name="categoryId" className="input" required>
            {roots.map((c) => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name}</option>
                {categories.filter((s) => s.parentId === c.id).map((s) => <option key={s.id} value={s.id}>{c.name} › {s.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Marque"><input name="brand" className="input" /></Field>
        <Field label="Modèle"><input name="model" className="input" /></Field>
        <Field label="N° de série"><input name="serial" className="input" /></Field>
        <Field label="Quantité"><input name="quantity" type="number" min={1} defaultValue={1} className="input" /></Field>
        <Field label="Caractéristiques" className="md:col-span-2"><input name="specs" className="input" placeholder="8K, 45 MP" /></Field>
        <Field label="Description" className="md:col-span-2"><textarea name="description" className="input" rows={3} /></Field>
        <Field label="Date d'achat"><input name="purchaseDate" type="date" className="input" /></Field>
        <Field label="Prix d'achat (FDJ)"><input name="purchasePrice" className="input" inputMode="numeric" /></Field>
        <Field label="Fournisseur"><input name="supplier" className="input" /></Field>
        <Field label="Fin de garantie"><input name="warrantyEnd" type="date" className="input" /></Field>
        <Field label="Emplacement">
          <select name="locationId" className="input">
            <option value="">—</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="État">
          <select name="condition" className="input" defaultValue="bon">
            {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Disponibilité">
          <select name="availability" className="input" defaultValue="disponible">
            {Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Photo"><input name="photo" type="file" accept="image/*" className="input" /></Field>
        <Field label="Facture"><input name="invoice" type="file" className="input" /></Field>
        <Field label="Notes" className="md:col-span-2"><textarea name="notes" className="input" rows={2} /></Field>
        <div className="md:col-span-2"><button className="btn-gold">Enregistrer</button></div>
      </form>
    </>
  );
}
