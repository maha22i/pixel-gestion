import Link from "next/link";
import { Paperclip, X } from "lucide-react";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, today } from "@/lib/format";
import { SubmitButton } from "@/components/ConfirmButton";
import { CAT_COLOR } from "./colors";

type Editing = {
  id: number;
  date: string;
  category: string;
  description: string;
  supplier: string | null;
  amount: number;
  method: string | null;
  projectId: number | null;
  proofStored: string | null;
  proofFilename: string | null;
};

const pill =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-navy-200 bg-white px-3 text-[13px] font-bold text-navy-700 transition " +
  "hover:border-navy-300 hover:bg-navy-50 peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white " +
  "peer-focus-visible:ring-2 peer-focus-visible:ring-gold/60 peer-focus-visible:ring-offset-1";

/** Formulaire d'ajout / de modification d'une dépense, affiché dans une fenêtre modale. */
export function ExpenseForm({
  action, editing, projects, suppliers, defaultProject, closeHref,
}: {
  action: (fd: FormData) => Promise<void>;
  editing?: Editing;
  projects: { id: number; title: string }[];
  suppliers: string[];
  defaultProject: number | "";
  closeHref: string;
}) {
  const category = editing?.category ?? "materiel";
  const method = editing?.method ?? "especes";
  return (
    <form action={action}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-navy-100 bg-white px-5 py-4 sm:px-6">
        <h2 id="exp-title" className="text-lg font-bold text-navy">{editing ? "Modifier la dépense" : "Nouvelle dépense"}</h2>
        <Link href={closeHref} scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 transition hover:bg-navy-50 hover:text-navy" aria-label="Fermer le formulaire" title="Fermer">
          <X size={18} />
        </Link>
      </div>
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[300px_1fr] lg:gap-7">
        {/* Colonne montant */}
        <div className="space-y-4 rounded-xl bg-gold-50/70 p-4 ring-1 ring-gold-100">
          <div>
            <label htmlFor="exp-amount" className="label">Montant</label>
            <div className="relative">
              <input
                id="exp-amount"
                name="amount"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                autoFocus
                defaultValue={editing?.amount}
                placeholder="0"
                className="input h-14 pr-16 text-[26px] font-bold tabular-nums text-navy [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-navy-600/60">FDJ</span>
            </div>
          </div>
          <div>
            <label htmlFor="exp-date" className="label">Date</label>
            <input id="exp-date" name="date" type="date" className="input" defaultValue={editing?.date ?? today()} required />
          </div>
          <div>
            <label htmlFor="exp-file" className="label">Justificatif <span className="font-normal text-navy-600/60">(facultatif)</span></label>
            {editing?.proofStored && (
              <div className="mb-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-navy-100">
                <a href={`/api/fichiers/depense/${editing.id}`} target="_blank" className="link inline-flex max-w-full items-center gap-1.5 font-normal">
                  <Paperclip size={14} className="shrink-0" aria-hidden />
                  <span className="truncate">{editing.proofFilename || "Justificatif"}</span>
                </a>
                <label className="mt-1 flex items-center gap-2 text-navy-600/80">
                  <input type="checkbox" name="dropProof" value="1" className="h-4 w-4 accent-red-600" />
                  Retirer ce justificatif
                </label>
              </div>
            )}
            <input
              id="exp-file"
              name="file"
              type="file"
              accept="application/pdf,image/*"
              className="block w-full text-sm text-navy-700 file:mr-3 file:rounded-lg file:border file:border-navy-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-navy"
            />
            <p className="mt-1 text-xs text-navy-600/60">
              PDF ou photo, 15 Mo max.{editing?.proofStored ? " Un nouveau fichier remplace l'actuel." : ""}
            </p>
          </div>
        </div>

        {/* Détails */}
        <div className="min-w-0 space-y-4">
          <div>
            <label htmlFor="exp-desc" className="label">Description</label>
            <input id="exp-desc" name="description" className="input" defaultValue={editing?.description} required placeholder="ex. Carburant tournage Tadjourah" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="exp-supplier" className="label">Fournisseur / bénéficiaire</label>
              <input id="exp-supplier" name="supplier" className="input" list="exp-suppliers" defaultValue={editing?.supplier ?? ""} autoComplete="off" />
              <datalist id="exp-suppliers">
                {suppliers.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor="exp-project" className="label">Projet</label>
              <select id="exp-project" name="projectId" className="input" defaultValue={defaultProject}>
                <option value="">Frais généraux (aucun projet)</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="label">Catégorie</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                <label key={k} className="cursor-pointer">
                  <input type="radio" name="category" value={k} defaultChecked={k === category} className="peer sr-only" />
                  <span className={pill}>
                    <span className={`h-2 w-2 rounded-full ring-1 ring-white/80 ${CAT_COLOR[k] ?? "bg-navy-200"}`} aria-hidden />
                    {v}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Mode de paiement</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                <label key={k} className="cursor-pointer">
                  <input type="radio" name="method" value={k} defaultChecked={k === method} className="peer sr-only" />
                  <span className={pill}>{v}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
        <Link href={closeHref} scroll={false} className="btn-ghost">Annuler</Link>
        <SubmitButton>{editing ? "Enregistrer les modifications" : "Ajouter la dépense"}</SubmitButton>
      </div>
    </form>
  );
}
