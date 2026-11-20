"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type I = { label: string; amount: number; dueDate: string | null };
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ");

export function InstallmentsEditor({ action, initial, total, onCancelHref }: { action: (fd: FormData) => void; initial: I[]; total: number; onCancelHref: string }) {
  const [list, setList] = useState<I[]>(initial);
  const sum = list.reduce((s, i) => s + (i.amount || 0), 0);
  const diff = total - sum;
  const set = (idx: number, patch: Partial<I>) => setList(list.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="payload" value={JSON.stringify(list)} />
      {list.map((it, idx) => (
        <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-navy-100 p-2 min-[480px]:grid-cols-2">
          <input className="input h-8 min-[480px]:col-span-2" value={it.label} onChange={(e) => set(idx, { label: e.target.value })} placeholder="Libellé" />
          <input className="input h-8 text-right" type="number" min={0} value={it.amount} onChange={(e) => set(idx, { amount: Math.round(Number(e.target.value)) || 0 })} />
          <div className="flex min-w-0 gap-1">
            <input className="input h-8 min-w-0 flex-1 px-1.5 text-sm" type="date" value={it.dueDate ?? ""} onChange={(e) => set(idx, { dueDate: e.target.value || null })} title="Échéance (vide = à la livraison)" />
            <button type="button" className="shrink-0 p-1 text-red-600/70" onClick={() => setList(list.filter((_, i) => i !== idx))} aria-label="Retirer"><Trash2 size={15} /></button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm w-full" onClick={() => setList([...list, { label: `Versement ${list.length + 1}`, amount: Math.max(diff, 0), dueDate: null }])}>
        <Plus size={14} /> Ajouter une échéance
      </button>
      <p className={`text-sm font-bold ${diff === 0 ? "text-emerald-700" : "text-red-700"}`}>
        {diff === 0 ? "Total des échéances = total facture ✓" : `Écart avec le total : ${fmt(diff)} FDJ`}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" disabled={diff !== 0 || list.length === 0}>Enregistrer l'échéancier</button>
        <a href={onCancelHref} className="btn-ghost btn-sm">Annuler</a>
      </div>
    </form>
  );
}
