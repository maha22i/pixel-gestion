import { Clapperboard, Package } from "lucide-react";
import { ITEM_KINDS } from "@/lib/format";
import { SubmitButton } from "@/components/ConfirmButton";

type I = { kind: string; name: string; description: string | null; category: string | null; unit: string; unitPrice: number; active: boolean };

const UNITS = ["forfait", "jour", "demi-journée", "heure", "pièce", "photo", "vidéo", "mois", "épisode"];

export function ItemForm({
  action, item, categories, idPrefix = "item", cancel,
}: {
  action: (fd: FormData) => void;
  item?: I;
  categories: string[];
  idPrefix?: string;
  cancel?: React.ReactNode;
}) {
  const kind = item?.kind ?? "service";
  return (
    <form action={action} className="space-y-4">
      <fieldset>
        <legend className="label">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(ITEM_KINDS).map(([k, v]) => (
            <label key={k} className="cursor-pointer">
              <input type="radio" name="kind" value={k} defaultChecked={kind === k} className="peer sr-only" />
              <span className="flex h-11 items-center justify-center gap-2 rounded-xl border border-navy-200 bg-white text-[14px] font-bold text-navy-600/80 transition peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold">
                {k === "service" ? <Clapperboard size={16} aria-hidden /> : <Package size={16} aria-hidden />}
                {v}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor={`${idPrefix}-name`}>Nom *</label>
        <input id={`${idPrefix}-name`} name="name" className="input" required defaultValue={item?.name} placeholder="ex. Couverture vidéo 4K" />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-cat`}>Catégorie</label>
        <input id={`${idPrefix}-cat`} name="category" className="input" list={`${idPrefix}-cat-list`} defaultValue={item?.category ?? ""} placeholder="ex. Vidéo, Photo…" autoComplete="off" />
        <datalist id={`${idPrefix}-cat-list`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-desc`}>Description <span className="font-normal text-navy-600/60">· reprise sur le devis</span></label>
        <textarea id={`${idPrefix}-desc`} name="description" className="input" rows={3} defaultValue={item?.description ?? ""} placeholder="Ce qui est inclus, durée, livrables…" />
      </div>
      <div className="grid grid-cols-[1.2fr_1fr] gap-3">
        <div>
          <label className="label" htmlFor={`${idPrefix}-price`}>Prix unitaire *</label>
          <div className="relative">
            <input
              id={`${idPrefix}-price`}
              name="unitPrice"
              className="input pr-14 text-right font-bold tabular-nums"
              inputMode="numeric"
              pattern="[0-9\s]*"
              title="Montant en FDJ, chiffres uniquement"
              defaultValue={item?.unitPrice ?? ""}
              placeholder="0"
              required
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-navy-600/60">FDJ</span>
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-unit`}>Par</label>
          <input id={`${idPrefix}-unit`} name="unit" className="input" list={`${idPrefix}-unit-list`} defaultValue={item?.unit ?? "forfait"} autoComplete="off" />
          <datalist id={`${idPrefix}-unit-list`}>{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        </div>
      </div>
      {item && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-navy-100 bg-navy-50/50 p-3">
          <input type="checkbox" name="active" defaultChecked={item.active} className="peer sr-only" />
          <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-navy-200 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-gold after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
          <span>
            <span className="block font-bold text-navy">Actif</span>
            <span className="block text-sm text-navy-600/75">Proposé lors de la création des devis. Décochez pour archiver sans supprimer.</span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SubmitButton>{item ? "Enregistrer" : "Ajouter au catalogue"}</SubmitButton>
        {cancel}
      </div>
    </form>
  );
}
