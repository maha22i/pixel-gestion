"use client";
import { createContext, useContext, useRef, useState } from "react";
import { Braces, Check } from "lucide-react";

/** Carte d'étape numérotée, ancrée (#id) pour la navigation. */
export function StepCard({
  id, n, title, hint, done, action, children,
}: {
  id: string; n: number; title: string; hint?: React.ReactNode; done?: boolean; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section id={id} data-step={id} className="card scroll-mt-36 lg:scroll-mt-32">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-100/70 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? "bg-emerald-500 text-white" : "bg-navy text-white"}`}
            aria-hidden
          >
            {done ? <Check size={16} strokeWidth={3} /> : n}
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold leading-tight text-navy">{title}</h2>
            {hint && <p className="mt-0.5 text-sm text-navy-600/75">{hint}</p>}
          </div>
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </header>
      <div className="space-y-5 px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

export function SubHead({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="h-section">{children}</p>
      {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}

/** Choix exclusif sous forme de boutons accolés. */
export function Segmented<T extends string>({
  value, onChange, options, label, size = "md",
}: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; label?: string; size?: "md" | "sm";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-navy-200 bg-navy-50/60 p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-3 font-bold transition ${size === "sm" ? "h-7 text-[12px]" : "h-8 text-[13px]"} ${
              on ? "bg-white text-navy  ring-1 ring-navy-200" : "text-navy-600/80 hover:text-navy"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function TextInput({
  label, value, onChange, type = "text", placeholder, className = "", suffix, inputMode, hint, invalid,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string;
  suffix?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; hint?: React.ReactNode; invalid?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      <span className="relative block">
        <input
          className={`input ${suffix ? "pr-14" : ""} ${invalid ? "border-amber-400 bg-amber-50/40" : ""}`}
          type={type}
          value={value}
          placeholder={placeholder}
          inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[12px] font-bold text-navy-600/60">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-[12px] text-navy-600/70">{hint}</span>}
    </label>
  );
}

/** Zone de texte qui grandit avec son contenu et accepte l'insertion de variables. */
export function AutoTextarea({
  value, onChange, placeholder, min = 2, max = 18, className = "", ariaLabel,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; min?: number; max?: number; className?: string; ariaLabel?: string;
}) {
  const tokens = useContext(TokenCtx);
  const rows = Math.max(min, Math.min(max, value.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 92)), 0)));
  return (
    <textarea
      aria-label={ariaLabel}
      className={`input leading-relaxed ${className}`}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onFocus={(e) => tokens?.register(e.currentTarget, onChange)}
      onChange={(e) => {
        tokens?.register(e.currentTarget, onChange);
        onChange(e.target.value);
      }}
    />
  );
}

export function IconBtn({
  label, onClick, children, disabled, tone = "ghost",
}: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; tone?: "ghost" | "danger" }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition disabled:opacity-30 ${
        tone === "danger"
          ? "border-red-100 text-red-600 hover:bg-red-50"
          : "border-navy-100 text-navy-600 hover:border-navy-300 hover:bg-navy-50"
      }`}
    >
      {children}
    </button>
  );
}

/* ——— Variables {{…}} : insertion au curseur du dernier champ utilisé ——— */

type Target = { el: HTMLTextAreaElement; set: (v: string) => void };
const TokenCtx = createContext<{ register: (el: HTMLTextAreaElement, set: (v: string) => void) => void; target: React.MutableRefObject<Target | null> } | null>(null);

export function TokenProvider({ children }: { children: React.ReactNode }) {
  const target = useRef<Target | null>(null);
  const register = (el: HTMLTextAreaElement, set: (v: string) => void) => { target.current = { el, set }; };
  return <TokenCtx.Provider value={{ register, target }}>{children}</TokenCtx.Provider>;
}

export const TOKEN_GROUPS: { label: string; items: [string, string][] }[] = [
  { label: "Client", items: [["client.nom", "Nom"], ["client.sigle", "Sigle"], ["client.adresse", "Adresse"], ["client.nif", "NIF"], ["representant", "Représentant"], ["representant.qualite", "Qualité"], ["referent.nom", "Référent"]] },
  { label: "Dates", items: [["date.debut", "Début"], ["date.fin", "Fin"], ["duree.phrase", "Phrase de durée"], ["date.signature", "Signature"], ["lieu", "Lieu"]] },
  { label: "Montants", items: [["montant.total", "Total"], ["montant.total.lettres", "Total en lettres"], ["montant.mensuel", "Mensuel"], ["montant.formule", "Formule de prix"], ["montant.mention", "HT / TTC"]] },
  { label: "Pixel Nomade", items: [["prestataire.nom", "Nom"], ["prestataire.gerant", "Gérant"], ["paiement.modalites", "Modalités"], ["paiement.moyens", "Moyens de paiement"]] },
];

export function TokenPalette({ articles = [], defaultOpen }: { articles?: { key: string; label: string }[]; defaultOpen?: boolean }) {
  const ctx = useContext(TokenCtx);
  const [flash, setFlash] = useState("");
  function insert(token: string) {
    const text = `{{${token}}}`;
    const t = ctx?.target.current;
    if (!t || !document.body.contains(t.el)) {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      setFlash(`${text} copié — collez-le dans le texte.`);
      window.setTimeout(() => setFlash(""), 2500);
      return;
    }
    const { el, set } = t;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    set(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }
  return (
    <details className="group rounded-xl border border-navy-100 bg-navy-50/40" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-sm font-bold text-navy-700 [&::-webkit-details-marker]:hidden">
        <Braces size={15} className="text-gold-600" /> Insérer une variable
        <span className="font-normal text-navy-600/70">— cliquez dans le texte puis sur une variable</span>
      </summary>
      <div className="space-y-2 border-t border-navy-100 px-3 py-3">
        {TOKEN_GROUPS.map((g) => (
          <div key={g.label} className="flex flex-wrap items-center gap-1.5">
            <span className="w-full text-[11px] font-bold uppercase tracking-wider text-navy-600/60 sm:w-28">{g.label}</span>
            {g.items.map(([k, l]) => (
              <button
                key={k}
                type="button"
                title={`{{${k}}}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(k)}
                className="rounded-full border border-navy-200 bg-white px-2.5 py-1 text-[12px] font-bold text-navy-700 transition hover:border-gold hover:bg-gold-50"
              >
                {l}
              </button>
            ))}
          </div>
        ))}
        {articles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-full text-[11px] font-bold uppercase tracking-wider text-navy-600/60 sm:w-28">Renvoi</span>
            <select
              className="input h-8 w-auto max-w-full rounded-lg text-[12px] font-bold"
              value=""
              aria-label="Insérer un renvoi vers un article"
              onChange={(e) => { if (e.target.value) insert(`art.${e.target.value}`); }}
            >
              <option value="">Numéro d’un autre article…</option>
              {articles.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </div>
        )}
        <p className="text-[12px] text-navy-600/70">Les variables sont remplacées à la génération du PDF. Le gras s’écrit **ainsi**.</p>
        {flash && <p className="text-[12px] font-bold text-emerald-700">{flash}</p>}
      </div>
    </details>
  );
}
