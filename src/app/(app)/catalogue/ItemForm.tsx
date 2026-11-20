import { ITEM_KINDS } from "@/lib/format";
import { SubmitButton } from "@/components/ConfirmButton";

type I = { kind: string; name: string; description: string | null; category: string | null; unit: string; unitPrice: number; active: boolean };

export function ItemForm({ action, item, categories }: { action: (fd: FormData) => void; item?: I; categories: string[] }) {
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select name="kind" className="input" defaultValue={item?.kind ?? "service"}>
            {Object.entries(ITEM_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Catégorie</label>
          <input name="category" className="input" list="cat-list" defaultValue={item?.category ?? ""} placeholder="ex. Vidéo, Photo…" />
          <datalist id="cat-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>
      <div>
        <label className="label">Nom *</label>
        <input name="name" className="input" required defaultValue={item?.name} placeholder="ex. Couverture vidéo 4K" />
      </div>
      <div>
        <label className="label">Description (reprise sur le devis)</label>
        <textarea name="description" className="input" defaultValue={item?.description ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Prix unitaire (FDJ)</label>
          <input name="unitPrice" className="input" inputMode="numeric" defaultValue={item?.unitPrice ?? ""} required />
        </div>
        <div>
          <label className="label">Unité</label>
          <input name="unit" className="input" list="unit-list" defaultValue={item?.unit ?? "forfait"} />
          <datalist id="unit-list">
            {["forfait", "jour", "demi-journée", "heure", "pièce", "photo", "vidéo", "mois", "épisode"].map((u) => <option key={u} value={u} />)}
          </datalist>
        </div>
      </div>
      {item && (
        <label className="flex items-center gap-2 font-bold text-navy-700">
          <input type="checkbox" name="active" defaultChecked={item.active} className="w-4 h-4 accent-[#2C3E50]" />
          Actif (proposé dans les devis)
        </label>
      )}
      <SubmitButton>{item ? "Enregistrer" : "Ajouter au catalogue"}</SubmitButton>
    </form>
  );
}
