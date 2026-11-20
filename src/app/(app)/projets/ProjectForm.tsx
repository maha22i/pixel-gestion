"use client";
import { useState } from "react";
import Link from "next/link";
import { INTERNAL_STATUS, PRIORITY, PROJECT_NATURE, PROJECT_STATUS, PROJECT_TYPES } from "@/lib/format";
import { SubmitButton } from "@/components/ConfirmButton";

type P = {
  clientId: number | null; title: string; type: string; status: string; nature?: string | null;
  categoryId?: number | null; ownerId?: number | null; priority?: string | null; brief?: string | null;
  startDate: string | null; endDate: string | null; location: string | null; notes: string | null;
};

export function ProjectForm({
  action, p, clients,   eventTypes, selectedEvents, disabled, newClientHref, categories = [], people = [], memberIds = [],
}: {
  action: (fd: FormData) => void;
  p?: Partial<P>;
  clients: { id: number; name: string }[];
  eventTypes: { id: number; name: string; active: boolean; priceDjibouti?: number; priceRegions?: number }[];
  selectedEvents?: { eventTypeId: number; eventDate: string | null }[];
  disabled?: boolean;
  newClientHref?: string;
  categories?: { id: number; name: string }[];
  people?: { id: number; name: string; jobTitle?: string | null }[];
  memberIds?: number[];
}) {
  const [nature, setNature] = useState(p?.nature === "interne" || p?.type === "autonome" ? "interne" : "client");
  const [type, setType] = useState(p?.type && p.type !== "autonome" ? p.type : "mariage");
  const [sel, setSel] = useState<Record<number, boolean>>(
    Object.fromEntries((selectedEvents ?? []).map((e) => [e.eventTypeId, true]))
  );
  const dates = Object.fromEntries((selectedEvents ?? []).map((e) => [e.eventTypeId, e.eventDate ?? ""]));
  const visibleEvents = eventTypes.filter((e) => e.active || sel[e.id]);

  return (
    <form action={action} className="card card-pad">
      <fieldset disabled={disabled} className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Intitulé du projet *</label>
          <input name="title" className="input" required defaultValue={p?.title} placeholder="ex. Mariage Ahmed & Fatouma" />
        </div>
        <div>
          <label className="label">Nature</label>
          <select name="nature" className="input" value={nature} onChange={(e) => setNature(e.target.value)}>
            {Object.entries(PROJECT_NATURE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {nature === "client" ? (
          <div>
            <label className="label">Type</label>
            <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(PROJECT_TYPES).filter(([k]) => k !== "autonome").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Catégorie interne</label>
            <select name="categoryId" className="input" defaultValue={p?.categoryId ?? ""}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {nature === "client" && (
        <div>
          <label className="label">Client</label>
          <select name="clientId" className="input" defaultValue={p?.clientId ?? ""} required>
            <option value="">— Choisir un client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {newClientHref && !disabled && <Link href={newClientHref} className="text-sm link mt-1 inline-block">+ Créer un client</Link>}
        </div>
        )}
        <div>
          <label className="label">Responsable</label>
          <select name="ownerId" className="input" defaultValue={p?.ownerId ?? ""}>
            <option value="">—</option>
            {people.map((u) => <option key={u.id} value={u.id}>{u.name}{u.jobTitle ? ` · ${u.jobTitle}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Priorité</label>
          <select name="priority" className="input" defaultValue={p?.priority ?? "normale"}>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Statut</label>
          <select key={nature} name="status" className="input" defaultValue={nature === "interne" ? (p?.status && p.status in INTERNAL_STATUS ? p.status : "en_cours") : (p?.status ?? "prospect")}>
            {Object.entries(nature === "interne" ? INTERNAL_STATUS : PROJECT_STATUS).filter(([k]) => nature === "interne" || k !== "publie").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Lieu</label>
          <input name="location" className="input" defaultValue={p?.location ?? ""} />
        </div>
        <div>
          <label className="label">Date de début</label>
          <input name="startDate" type="date" className="input" defaultValue={p?.startDate ?? ""} />
        </div>
        <div>
          <label className="label">Date de fin / livraison</label>
          <input name="endDate" type="date" className="input" defaultValue={p?.endDate ?? ""} />
        </div>

        <div className="sm:col-span-2">
          <label className="label">Personnes affectées</label>
          <p className="mb-2 text-sm text-navy-600/70">Seules ces personnes, plus l'administrateur, voient ce projet.</p>
          <div className="flex flex-wrap gap-2">
            {people.map((u) => (
              <label key={u.id} className="flex items-center gap-2 rounded-lg border border-navy-100 px-2 py-1 text-sm">
                <input type="checkbox" name="memberIds" value={u.id} defaultChecked={memberIds.includes(u.id)} className="accent-[#F5A623]" />
                {u.name}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Brief</label>
          <textarea name="brief" className="input" defaultValue={p?.brief ?? ""} />
        </div>
        {nature === "client" && type === "mariage" && (
          <div className="sm:col-span-2 rounded-xl border border-gold/40 bg-gold-50/50 p-4">
            <p className="font-bold text-navy mb-1">Événements du mariage</p>
            <p className="text-sm text-navy-600/70 mb-3">Cochez les événements couverts. Le devis reprendra le tarif Djibouti-ville ou régions. La date est facultative.</p>
            {visibleEvents.length === 0 ? (
              <p className="text-sm">Aucun type d'événement. <Link href="/catalogue/evenements" className="link">Les ajouter dans le catalogue</Link>.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {visibleEvents.map((e) => (
                  <div key={e.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 bg-white ${sel[e.id] ? "border-gold" : "border-navy-100"}`}>
                    <label className="flex items-center gap-2 font-bold flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        name="eventTypeIds"
                        value={e.id}
                        checked={!!sel[e.id]}
                        onChange={(ev) => setSel({ ...sel, [e.id]: ev.target.checked })}
                        className="w-4 h-4 accent-[#F5A623]"
                      />
                      <span>
                        {e.name}
                        <span className="block text-xs font-normal text-navy-600/70">
                          {(e.priceDjibouti ?? 0).toLocaleString("fr-FR")} / {(e.priceRegions ?? 0).toLocaleString("fr-FR")} FDJ
                        </span>
                      </span>
                    </label>
                    {sel[e.id] && <input type="date" name={`eventDate_${e.id}`} defaultValue={dates[e.id]} className="input h-8 w-[140px] shrink-0 text-sm px-2" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea name="notes" className="input" defaultValue={p?.notes ?? ""} />
        </div>
        {!disabled && <div className="sm:col-span-2"><SubmitButton>{p?.title ? "Enregistrer" : "Créer le projet"}</SubmitButton></div>}
      </fieldset>
    </form>
  );
}
