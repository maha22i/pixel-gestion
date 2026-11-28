"use client";
import { Fragment } from "react";
import { RotateCcw } from "lucide-react";
import { MODULES, MODULE_GROUPS, levelShort, moduleLevels, type Level, type ModuleKey } from "@/lib/modules";

const TONE: Record<Level, string> = {
  none: "bg-white text-navy-600",
  own: "bg-sky-600 text-white",
  read: "bg-navy-600 text-white",
  write: "bg-emerald-600 text-white",
};

/**
 * Grille des droits par module. Avec `baseline` (droits du rôle), chaque écart est marqué « personnalisé »
 * et peut être remis au défaut ; les champs cachés `perm_<module>` sont envoyés avec le formulaire.
 */
export function PermMatrix({
  values, onChange, baseline, disabled,
}: {
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  baseline?: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-navy-100">
      {MODULE_GROUPS.map((g) => (
        <Fragment key={g.label}>
          <p className="bg-navy-50/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-navy-600/70">{g.label}</p>
          {MODULES.filter((m) => (g.keys as readonly string[]).includes(m.key)).map((m) => {
            const key = m.key as ModuleKey;
            const cur = (values[key] ?? "none") as Level;
            const def = baseline?.[key] as Level | undefined;
            const custom = baseline !== undefined && def !== cur;
            return (
              <div key={key} className={`flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 px-4 py-2 ${custom ? "bg-gold-50/50" : ""}`}>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${cur === "none" ? "text-navy-600/55" : "text-navy"}`}>{m.label}</span>
                  {custom && (
                    <span className="flex items-center gap-1.5 text-[11px] text-amber-800">
                      Personnalisé · rôle : {levelShort(key, def ?? "none")}
                      <button type="button" onClick={() => onChange({ ...values, [key]: def ?? "none" })} className="inline-flex items-center gap-0.5 font-bold underline-offset-2 hover:underline" disabled={disabled}>
                        <RotateCcw size={11} /> défaut
                      </button>
                    </span>
                  )}
                </span>
                <input type="hidden" name={`perm_${key}`} value={cur} />
                <div className="flex rounded-lg bg-navy-50 p-0.5" role="radiogroup" aria-label={`Accès ${m.label}`}>
                  {moduleLevels(key).map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={cur === l}
                      disabled={disabled}
                      onClick={() => onChange({ ...values, [key]: l })}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed ${cur === l ? `${TONE[l]} shadow-sm ring-1 ring-navy-100` : "text-navy-600/70 hover:text-navy"}`}
                    >
                      {levelShort(key, l)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
