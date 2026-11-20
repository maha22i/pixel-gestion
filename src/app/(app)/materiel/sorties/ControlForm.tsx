"use client";
import { useRef } from "react";
import Link from "next/link";
import { CONDITIONS, RETURN_CONDITIONS, RETURN_STATUS } from "@/lib/equipmentLabels";
import { checkSlip } from "./actions";

type Item = {
  id: number; equipmentId: number; quantity: number; conditionOut: string;
  returned: string | null; qtyReturned: number | null; conditionIn: string | null; noteIn: string | null;
};
type Eq = { id: number; ref: string | null; name: string };

export function ControlForm({ slipId, items, equipment }: { slipId: number; items: Item[]; equipment: Eq[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  function allGood() {
    const form = formRef.current;
    if (!form) return;
    for (const it of items) {
      const ret = form.querySelector<HTMLSelectElement>(`[name="returned_${it.id}"]`);
      const qty = form.querySelector<HTMLInputElement>(`[name="qtyReturned_${it.id}"]`);
      const cond = form.querySelector<HTMLSelectElement>(`[name="conditionIn_${it.id}"]`);
      if (ret) ret.value = "oui";
      if (qty) qty.value = String(it.quantity);
      if (cond) cond.value = "bon";
    }
  }

  return (
    <form ref={formRef} action={checkSlip.bind(null, slipId)} className="card card-pad space-y-4" id="controle">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="h-section">Contrôle de retour</p>
          <p className="text-sm text-navy-600/70">Par défaut : tout rentré en bon état. Ajustez les lignes si besoin, puis validez.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={allGood}>Tout rentré en bon état</button>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Matériel</th><th>Qté</th><th>Départ</th><th>Rentré</th><th>Qté rentrée</th><th>État retour</th><th>Remarque</th></tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const e = equipment.find((x) => x.id === it.equipmentId);
              return (
                <tr key={it.id}>
                  <td><Link className="link" href={`/materiel/${it.equipmentId}`}>{e?.ref} · {e?.name}</Link></td>
                  <td>{it.quantity}</td>
                  <td>{CONDITIONS[it.conditionOut] ?? it.conditionOut}</td>
                  <td>
                    <select name={`returned_${it.id}`} className="input" defaultValue={it.returned ?? "oui"}>
                      {Object.entries(RETURN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td><input name={`qtyReturned_${it.id}`} type="number" min={0} max={it.quantity} className="input" defaultValue={it.qtyReturned ?? it.quantity} /></td>
                  <td>
                    <select name={`conditionIn_${it.id}`} className="input" defaultValue={it.conditionIn ?? "bon"}>
                      {Object.entries(RETURN_CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td><input name={`noteIn_${it.id}`} className="input" defaultValue={it.noteIn ?? ""} placeholder="écran rayé…" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="btn-gold">Valider le contrôle</button>
    </form>
  );
}
