import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { PageHeader, Empty } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton, SubmitButton } from "@/components/ConfirmButton";
import { CatalogTabs } from "../Tabs";
import { createEventType, deleteEventType, updateEventType } from "../actions";

export default async function EventTypesPage({ searchParams }: { searchParams: { ok?: string } }) {
  const user = await requirePerm("catalogue");
  const write = can(user, "catalogue", "write");
  const events = await db.select().from(schema.eventTypes).orderBy(asc(schema.eventTypes.position), asc(schema.eventTypes.name));
  return (
    <>
      <PageHeader title="Catalogue" subtitle="Chaque événement a un prix Djibouti-ville et un prix régions. Un devis mariage les reprend dès qu'on les coche." />
      <CatalogTabs active="events" />
      <Flash message={searchParams.ok ? "Enregistré." : ""} clear={["ok"]} />
      {write && (
        <form action={createEventType} className="card card-pad mb-6 grid lg:grid-cols-[1fr_1.4fr_130px_130px_90px_auto] gap-3 items-end">
          <div><label className="label">Nom *</label><input name="name" className="input" required placeholder="ex. Henné" /></div>
          <div><label className="label">Description</label><input name="description" className="input" /></div>
          <div><label className="label">Djibouti-ville</label><input name="priceDjibouti" type="number" min={0} className="input" defaultValue={50000} /></div>
          <div><label className="label">Régions</label><input name="priceRegions" type="number" min={0} className="input" defaultValue={65000} /></div>
          <div><label className="label">Ordre</label><input name="position" type="number" className="input" defaultValue={events.length + 1} /></div>
          <SubmitButton>Ajouter</SubmitButton>
        </form>
      )}
      <div className="card overflow-hidden">
        {events.length === 0 ? <Empty title="Aucun type d'événement">Ajoutez vos types d'événement de mariage ci-dessus.</Empty> : write ? (
          <>
            <div className="space-y-3 p-3 lg:hidden">
              {events.map((e) => (
                <div key={e.id} className="rounded-xl border border-navy-100 p-3">
                  <form action={updateEventType.bind(null, e.id)} className="grid gap-2">
                    <div className="grid grid-cols-[5.5rem_1fr] items-end gap-2">
                      <div><label className="label">Ordre</label><input name="position" type="number" className="input" defaultValue={e.position} /></div>
                      <label className="mb-2 flex items-center gap-2 text-sm font-bold text-navy"><input type="checkbox" name="active" defaultChecked={e.active} className="h-4 w-4 accent-[#2C3E50]" /> Actif</label>
                    </div>
                    <div><label className="label">Nom</label><input name="name" className="input font-bold" defaultValue={e.name} required /></div>
                    <div><label className="label">Description</label><input name="description" className="input" defaultValue={e.description ?? ""} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="label">Djibouti-ville</label><input name="priceDjibouti" type="number" min={0} className="input text-right" defaultValue={e.priceDjibouti} /></div>
                      <div><label className="label">Régions</label><input name="priceRegions" type="number" min={0} className="input text-right" defaultValue={e.priceRegions} /></div>
                    </div>
                    <button className="btn-ghost">Enregistrer</button>
                  </form>
                  <form action={deleteEventType.bind(null, e.id)} className="mt-2">
                    <ConfirmButton message={`Supprimer « ${e.name} » ?`}>Supprimer</ConfirmButton>
                  </form>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto lg:block">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[70px_1fr_1.3fr_120px_120px_52px_110px_72px] gap-2 px-4 py-2.5 bg-navy-50/60 border-b border-navy-100 text-[12px] font-bold uppercase tracking-wider text-navy-600/70">
              <span>Ordre</span><span>Nom</span><span>Description</span><span>Djibouti-ville</span><span>Régions</span><span className="text-center">Actif</span><span /><span />
            </div>
            {events.map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_72px] items-center border-b border-navy-50 last:border-0">
                <form action={updateEventType.bind(null, e.id)} className="grid grid-cols-[70px_1fr_1.3fr_120px_120px_52px_110px] gap-2 items-center pl-4 py-2">
                  <input name="position" type="number" className="input" defaultValue={e.position} />
                  <input name="name" className="input font-bold" defaultValue={e.name} required />
                  <input name="description" className="input" defaultValue={e.description ?? ""} />
                  <input name="priceDjibouti" type="number" min={0} className="input text-right" defaultValue={e.priceDjibouti} />
                  <input name="priceRegions" type="number" min={0} className="input text-right" defaultValue={e.priceRegions} />
                  <input type="checkbox" name="active" defaultChecked={e.active} className="w-4 h-4 accent-[#2C3E50] justify-self-center" />
                  <button className="btn-ghost btn-sm">Enregistrer</button>
                </form>
                <form action={deleteEventType.bind(null, e.id)} className="pr-4">
                  <ConfirmButton message={`Supprimer « ${e.name} » ?`}>Suppr.</ConfirmButton>
                </form>
              </div>
            ))}
          </div>
            </div>
          </>
        ) : (
          <table className="table">
            <thead><tr><th>Ordre</th><th>Nom</th><th>Description</th><th className="num">Djibouti-ville</th><th className="num">Régions</th><th>Actif</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}><td>{e.position}</td><td className="font-bold">{e.name}</td><td>{e.description}</td><td className="num">{e.priceDjibouti.toLocaleString("fr-FR")}</td><td className="num">{e.priceRegions.toLocaleString("fr-FR")}</td><td>{e.active ? "Oui" : "Non"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
