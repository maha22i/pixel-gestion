import Link from "next/link";
import { ArrowDown, ArrowUp, Check, FolderTree, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ConfirmButton, SubmitButton } from "@/components/ConfirmButton";
import { createCategory, createLocation, deleteCategory, deleteLocation, moveCategory, renameCategory, renameLocation } from "./actions";

type Category = { id: number; name: string; parentId: number | null };
type Location = { id: number; name: string };

const OK: Record<string, string> = { ajoute: "Ajouté.", renomme: "Renommé.", supprime: "Supprimé." };
const ERR: Record<string, string> = {
  nom: "Le nom ne peut pas être vide.",
  parent: "Une sous-catégorie ne peut pas contenir d'autres sous-catégories.",
  cat: "Cette catégorie contient du matériel ou une sous-catégorie : déplacez-les avant de la supprimer.",
};

function Header({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-navy-100 bg-white px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-100 text-amber-800">{icon}</span>
        <div>
          <h2 id="manage-title" className="text-lg font-bold text-navy">{title}</h2>
          <p className="text-sm text-navy-600/70">{hint}</p>
        </div>
      </div>
      <Link href="/materiel" scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 transition hover:bg-navy-50 hover:text-navy" aria-label="Fermer" title="Fermer"><X size={18} /></Link>
    </div>
  );
}

function Notice({ ok, err }: { ok?: string; err?: string }) {
  if (err && ERR[err]) return <p role="alert" className="mx-5 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 sm:mx-6">{ERR[err]}</p>;
  if (ok && OK[ok]) return <p className="mx-5 mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 sm:mx-6">{OK[ok]}</p>;
  return null;
}

const iconBtn = "grid h-8 w-8 place-items-center rounded-lg text-navy-600 transition hover:bg-navy-50 hover:text-navy disabled:opacity-30";

/** Une ligne : nom (ou champ de renommage si `editing`), compteur, actions. */
function Row({
  name, count, editing, editHref, rename, id, children,
}: {
  name: string; count: number; editing: boolean; editHref: string; rename: (fd: FormData) => void; id: number; children?: React.ReactNode;
}) {
  if (editing) {
    return (
      <form action={rename} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <input name="name" defaultValue={name} className="input h-9" autoFocus required aria-label="Nouveau nom" />
        <SubmitButton className="btn-primary btn-sm"><Check size={14} /> OK</SubmitButton>
        <Link href={editHref.replace(/&edit=\d+/, "")} scroll={false} className="btn-ghost btn-sm">Annuler</Link>
      </form>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">{name}</span>
      <span className="shrink-0 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-600" title="Équipements rattachés">{count} équip.</span>
      <span className="flex shrink-0 items-center">
        {children}
        <Link href={editHref} scroll={false} className={iconBtn} aria-label={`Renommer ${name}`} title="Renommer"><Pencil size={15} /></Link>
      </span>
    </div>
  );
}

export function CategoriesModal({ categories, counts, edit, ok, err }: { categories: Category[]; counts: Map<number, number>; edit: number; ok?: string; err?: string }) {
  const roots = categories.filter((c) => !c.parentId);
  const base = "/materiel?gerer=categories";
  const move = (id: number, dir: -1 | 1, disabled: boolean, label: string) => (
    <form action={moveCategory.bind(null, id, dir)}>
      <button className={iconBtn} disabled={disabled} aria-label={label} title={label}>{dir < 0 ? <ArrowUp size={15} /> : <ArrowDown size={15} />}</button>
    </form>
  );
  const del = (id: number, name: string, blocked: boolean) => (
    <form action={deleteCategory.bind(null, id)}>
      <ConfirmButton
        className={`${iconBtn} hover:bg-red-50 hover:text-red-700`}
        message={blocked ? `« ${name} » contient du matériel ou des sous-catégories. La suppression sera refusée.` : `Supprimer « ${name} » ?`}
      >
        <Trash2 size={15} />
      </ConfirmButton>
    </form>
  );
  return (
    <Modal closeHref="/materiel" labelledBy="manage-title" width="max-w-2xl">
      <Header icon={<FolderTree size={20} />} title="Catégories" hint="Familles et sous-familles de matériel." />
      <Notice ok={ok} err={err} />
      <div className="p-5 sm:p-6">
        {roots.length === 0 ? <p className="text-sm text-navy-600/70">Aucune catégorie pour l'instant.</p> : (
          <ul className="space-y-3">
            {roots.map((c, i) => {
              const subs = categories.filter((s) => s.parentId === c.id);
              const total = (counts.get(c.id) ?? 0) + subs.reduce((n, s) => n + (counts.get(s.id) ?? 0), 0);
              return (
                <li key={c.id} className="rounded-xl border border-navy-100">
                  <div className="px-3 py-2">
                    <Row name={c.name} count={total} id={c.id} rename={renameCategory} editing={edit === c.id} editHref={`${base}&edit=${c.id}`}>
                      {move(c.id, -1, i === 0, "Monter")}
                      {move(c.id, 1, i === roots.length - 1, "Descendre")}
                      {del(c.id, c.name, subs.length > 0 || total > 0)}
                    </Row>
                  </div>
                  {subs.length > 0 && (
                    <ul className="space-y-1 border-t border-navy-100 bg-navy-50/40 py-1.5 pl-6 pr-3">
                      {subs.map((s, j) => (
                        <li key={s.id} className="relative py-0.5 before:absolute before:-left-3 before:top-1/2 before:h-px before:w-2 before:bg-navy-200">
                          <Row name={s.name} count={counts.get(s.id) ?? 0} id={s.id} rename={renameCategory} editing={edit === s.id} editHref={`${base}&edit=${s.id}`}>
                            {move(s.id, -1, j === 0, "Monter")}
                            {move(s.id, 1, j === subs.length - 1, "Descendre")}
                            {del(s.id, s.name, (counts.get(s.id) ?? 0) > 0)}
                          </Row>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form key={`new-${categories.length}`} action={createCategory} className="sticky bottom-0 grid gap-3 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:px-6">
        <label className="block"><span className="label">Nouvelle catégorie</span><input name="name" className="input" placeholder="ex. Éclairage" required /></label>
        <label className="block"><span className="label">Rangée dans</span>
          <select name="parentId" className="input" defaultValue="">
            <option value="">Catégorie principale</option>
            {roots.map((c) => <option key={c.id} value={c.id}>Sous-catégorie de « {c.name} »</option>)}
          </select>
        </label>
        <SubmitButton className="btn-gold"><Plus size={16} /> Ajouter</SubmitButton>
      </form>
    </Modal>
  );
}

export function LocationsModal({ locations, counts, edit, ok, err }: { locations: Location[]; counts: Map<number, number>; edit: number; ok?: string; err?: string }) {
  const base = "/materiel?gerer=emplacements";
  return (
    <Modal closeHref="/materiel" labelledBy="manage-title" width="max-w-xl">
      <Header icon={<MapPin size={20} />} title="Emplacements" hint="Lieux de stockage et d'utilisation." />
      <Notice ok={ok} err={err} />
      <div className="p-5 sm:p-6">
        {locations.length === 0 ? <p className="text-sm text-navy-600/70">Aucun emplacement pour l'instant.</p> : (
          <ul className="divide-y divide-navy-100 rounded-xl border border-navy-100">
            {locations.map((l) => {
              const n = counts.get(l.id) ?? 0;
              return (
                <li key={l.id} className="px-3 py-2">
                  <Row name={l.name} count={n} id={l.id} rename={renameLocation} editing={edit === l.id} editHref={`${base}&edit=${l.id}`}>
                    <form action={deleteLocation.bind(null, l.id)}>
                      <ConfirmButton
                        className={`${iconBtn} hover:bg-red-50 hover:text-red-700`}
                        message={n ? `Supprimer « ${l.name} » ? ${n} équipement(s) n'auront plus d'emplacement.` : `Supprimer « ${l.name} » ?`}
                      >
                        <Trash2 size={15} />
                      </ConfirmButton>
                    </form>
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form key={`new-${locations.length}`} action={createLocation} className="sticky bottom-0 flex items-end gap-2 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
        <label className="block flex-1"><span className="label">Nouvel emplacement</span><input name="name" className="input" placeholder="ex. Armoire studio" required /></label>
        <SubmitButton className="btn-gold"><Plus size={16} /> Ajouter</SubmitButton>
      </form>
    </Modal>
  );
}
