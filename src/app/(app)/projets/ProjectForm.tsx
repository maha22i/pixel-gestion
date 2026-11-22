"use client";
import { useState } from "react";
import Link from "next/link";
import { Building2, Check, Crown, Heart, Landmark, Lock, Users } from "lucide-react";
import { INTERNAL_STATUS, PRIORITY, PROJECT_STATUS, PROJECT_TYPES } from "@/lib/format";
import { SubmitButton } from "@/components/ConfirmButton";
import { Avatar } from "@/components/ui";

type P = {
  clientId: number | null; title: string; type: string; status: string; nature?: string | null;
  categoryId?: number | null; ownerId?: number | null; priority?: string | null; brief?: string | null;
  startDate: string | null; endDate: string | null; location: string | null; notes: string | null;
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  mariage: <Heart size={16} aria-hidden />,
  prive: <Building2 size={16} aria-hidden />,
  public: <Landmark size={16} aria-hidden />,
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-navy-100/80 pt-5 first:border-0 first:pt-0 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h2 className="h-section">{title}</h2>
        {hint && <p className="mt-1 text-sm text-navy-600/70">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Segmented({ name, value, onChange, options }: {
  name: string; value: string; onChange: (v: string) => void; options: [string, string, React.ReactNode?][];
}) {
  return (
    <div className={`grid gap-2 ${options.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
      {options.map(([k, label, icon]) => (
        <label key={k} className="cursor-pointer">
          <input type="radio" name={name} value={k} checked={value === k} onChange={() => onChange(k)} className="peer sr-only" />
          <span className="flex h-11 items-center justify-center gap-2 rounded-xl border border-navy-200 bg-white px-3 text-center text-[14px] font-bold leading-tight text-navy-600/80 transition hover:border-navy-600/40 peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
            {icon}{label}
          </span>
        </label>
      ))}
    </div>
  );
}

export function ProjectForm({
  action, p, clients, eventTypes, selectedEvents, disabled, newClientHref, categories = [], people = [], memberIds = [], cancelHref,
}: {
  action: (fd: FormData) => void;
  p?: Partial<P>;
  clients: { id: number; name: string }[];
  eventTypes: { id: number; name: string; active: boolean; priceDjibouti?: number; priceRegions?: number }[];
  selectedEvents?: { eventTypeId: number; eventDate: string | null }[];
  disabled?: boolean;
  newClientHref?: string;
  categories?: { id: number; name: string }[];
  people?: { id: number; name: string; jobTitle?: string | null; color?: string | null }[];
  memberIds?: number[];
  cancelHref?: string;
}) {
  const [nature, setNature] = useState(p?.nature === "interne" || p?.type === "autonome" ? "interne" : "client");
  const [type, setType] = useState(p?.type && p.type !== "autonome" ? p.type : "mariage");
  const [owner, setOwner] = useState(String(p?.ownerId ?? ""));
  const [start, setStart] = useState(p?.startDate ?? "");
  const [members, setMembers] = useState<Record<number, boolean>>(Object.fromEntries(memberIds.map((id) => [id, true])));
  const [sel, setSel] = useState<Record<number, boolean>>(
    Object.fromEntries((selectedEvents ?? []).map((e) => [e.eventTypeId, true]))
  );
  const dates = Object.fromEntries((selectedEvents ?? []).map((e) => [e.eventTypeId, e.eventDate ?? ""]));
  const visibleEvents = eventTypes.filter((e) => e.active || sel[e.id]);
  const team = people.filter((u) => members[u.id] || String(u.id) === owner).length;

  return (
    <form action={action} className="card card-pad">
      <fieldset disabled={disabled} className="space-y-6">
        <Section title="L'essentiel">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="pf-title">Intitulé du projet *</label>
            <input id="pf-title" name="title" className="input text-[15px] font-bold" required defaultValue={p?.title} placeholder="ex. Mariage Ahmed & Fatouma" />
          </div>
          <div className="sm:col-span-2">
            <span className="label">Nature</span>
            <Segmented name="nature" value={nature} onChange={setNature} options={[["client", "Projet client", <Users key="c" size={16} aria-hidden />], ["interne", "Projet interne", <Lock key="i" size={16} aria-hidden />]]} />
          </div>
          {nature === "client" ? (
            <>
              <div className="sm:col-span-2">
                <span className="label">Type de projet</span>
                <Segmented
                  name="type"
                  value={type}
                  onChange={setType}
                  options={Object.entries(PROJECT_TYPES).filter(([k]) => k !== "autonome").map(([k, v]) => [k, v, TYPE_ICON[k]])}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="pf-client">Client *</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select id="pf-client" name="clientId" className="input sm:flex-1" defaultValue={p?.clientId ?? ""} required>
                    <option value="">— Choisir un client —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {newClientHref && !disabled && <Link href={newClientHref} className="btn-ghost btn-sm shrink-0">+ Nouveau client</Link>}
                </div>
              </div>
            </>
          ) : (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="pf-cat">Catégorie interne</label>
              <select id="pf-cat" name="categoryId" className="input" defaultValue={p?.categoryId ?? ""}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </Section>

        {nature === "client" && type === "mariage" && (
          <section className="rounded-xl border border-gold/40 bg-gold-50/50 p-4">
            <p className="mb-1 flex items-center gap-2 font-bold text-navy"><Heart size={16} className="text-gold-600" aria-hidden /> Événements du mariage</p>
            <p className="mb-3 text-sm text-navy-600/70">Cochez les événements couverts. Le devis reprendra le tarif Djibouti-ville ou régions. La date est facultative.</p>
            {visibleEvents.length === 0 ? (
              <p className="text-sm">Aucun type d'événement. <Link href="/catalogue/evenements" className="link">Les ajouter dans le catalogue</Link>.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleEvents.map((e) => (
                  <div key={e.id} className={`flex flex-wrap items-center gap-3 rounded-lg border bg-white px-3 py-2 ${sel[e.id] ? "border-gold" : "border-navy-100"}`}>
                    <label className="flex min-w-[9rem] flex-1 cursor-pointer items-center gap-2 font-bold">
                      <input
                        type="checkbox"
                        name="eventTypeIds"
                        value={e.id}
                        checked={!!sel[e.id]}
                        onChange={(ev) => setSel({ ...sel, [e.id]: ev.target.checked })}
                        className="h-4 w-4 accent-[#F5A623]"
                      />
                      <span>
                        {e.name}
                        <span className="block text-xs font-normal text-navy-600/70">
                          {(e.priceDjibouti ?? 0).toLocaleString("fr-FR")} / {(e.priceRegions ?? 0).toLocaleString("fr-FR")} FDJ
                        </span>
                      </span>
                    </label>
                    {sel[e.id] && <input type="date" name={`eventDate_${e.id}`} defaultValue={dates[e.id]} aria-label={`Date — ${e.name}`} className="input h-8 w-[140px] shrink-0 px-2 text-sm" />}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <Section title="Suivi">
          <div>
            <label className="label" htmlFor="pf-status">Statut</label>
            <select id="pf-status" key={nature} name="status" className="input" defaultValue={nature === "interne" ? (p?.status && p.status in INTERNAL_STATUS ? p.status : "en_cours") : (p?.status ?? "prospect")}>
              {Object.entries(nature === "interne" ? INTERNAL_STATUS : PROJECT_STATUS).filter(([k]) => nature === "interne" || k !== "publie").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pf-priority">Priorité</label>
            <select id="pf-priority" name="priority" className="input" defaultValue={p?.priority ?? "normale"}>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pf-start">Date de début</label>
            <input id="pf-start" name="startDate" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pf-end">Date de fin / livraison</label>
            <input id="pf-end" name="endDate" type="date" className="input" min={start || undefined} defaultValue={p?.endDate ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="pf-location">Lieu</label>
            <input id="pf-location" name="location" className="input" defaultValue={p?.location ?? ""} placeholder="ex. Djibouti-ville, Tadjourah…" />
          </div>
        </Section>

        <Section title="Équipe" hint="Seules ces personnes, plus l'administrateur, voient ce projet. Le responsable en fait toujours partie.">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="pf-owner">Responsable</label>
            <select id="pf-owner" name="ownerId" className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">— Personne —</option>
              {people.map((u) => <option key={u.id} value={u.id}>{u.name}{u.jobTitle ? ` · ${u.jobTitle}` : ""}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <span className="label">Personnes affectées <span className="font-normal text-navy-600/60">· {team} sélectionnée{team > 1 ? "s" : ""}</span></span>
            <div className="flex flex-wrap gap-2">
              {people.map((u) => {
                const isOwner = String(u.id) === owner;
                const on = isOwner || !!members[u.id];
                return (
                  <label key={u.id} className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${on ? "border-gold bg-gold-50 text-navy" : "border-navy-100 bg-white text-navy-600/80 hover:border-navy-200"}`}>
                    <input
                      type="checkbox"
                      name="memberIds"
                      value={u.id}
                      checked={on}
                      disabled={isOwner}
                      onChange={(e) => setMembers({ ...members, [u.id]: e.target.checked })}
                      className="sr-only"
                    />
                    <Avatar name={u.name} color={u.color} size={26} />
                    <span className="font-bold">{u.name}</span>
                    {isOwner ? <Crown size={14} className="text-gold-600" aria-label="Responsable" /> : on && <Check size={14} className="text-emerald-600" aria-hidden />}
                  </label>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="Brief & notes">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="pf-brief">Brief</label>
            <textarea id="pf-brief" name="brief" className="input" rows={3} defaultValue={p?.brief ?? ""} placeholder="Objectif, messages clés, livrables attendus…" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="pf-notes">Notes internes</label>
            <textarea id="pf-notes" name="notes" className="input" defaultValue={p?.notes ?? ""} />
          </div>
        </Section>

        {!disabled && (
          <div className="flex flex-wrap items-center gap-2 border-t border-navy-100/80 pt-5">
            <SubmitButton>{p?.title ? "Enregistrer les modifications" : "Créer le projet"}</SubmitButton>
            {cancelHref && <Link href={cancelHref} className="btn-ghost">Annuler</Link>}
          </div>
        )}
      </fieldset>
    </form>
  );
}
