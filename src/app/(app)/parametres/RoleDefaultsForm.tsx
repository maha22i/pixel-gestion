"use client";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { PermMatrix } from "@/components/PermMatrix";
import { SubmitButton } from "@/components/ConfirmButton";

export function RoleDefaultsForm({
  action, values, factory,
}: {
  action: (fd: FormData) => void;
  values: Record<string, string>;
  factory: Record<string, string>;
}) {
  const [v, setV] = useState(values);
  const differs = Object.keys(factory).some((k) => (v[k] ?? "none") !== factory[k]);
  return (
    <form action={action} className="card">
      <div className="p-5 sm:p-6">
        <PermMatrix values={v} onChange={setV} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 bg-navy-50/40 px-5 py-4 sm:px-6">
        {differs
          ? <button type="button" onClick={() => setV({ ...factory })} className="btn-ghost btn-sm"><RotateCcw size={13} /> Valeurs d'origine</button>
          : <span className="text-xs text-navy-600/60">Valeurs d'origine</span>}
        <SubmitButton>Enregistrer les droits du rôle</SubmitButton>
      </div>
    </form>
  );
}
