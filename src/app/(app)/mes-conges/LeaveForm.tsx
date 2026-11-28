"use client";
import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Baby, CalendarDays, FileUp, HeartPulse, LoaderCircle, Send, Stethoscope, TreePalm, X } from "lucide-react";

type Kind = { key: string; label: string; hint: string; needsDoc: boolean; countsLeave: boolean };

const ICON: Record<string, React.ReactNode> = {
  conge: <TreePalm size={18} />,
  maladie: <Stethoscope size={18} />,
  familial: <Baby size={18} />,
  sans_solde: <CalendarDays size={18} />,
  autre: <HeartPulse size={18} />,
};

/** Fenêtre « Nouvelle demande » : type, dates, motif et, pour la maladie, le certificat. */
export function LeaveForm({
  action, kinds, initial, balance, error, closeHref,
}: {
  action: (fd: FormData) => void;
  kinds: Kind[];
  initial: { kind: string; start: string; end: string };
  balance: { left: number; entitled: number } | null;
  error: string;
  closeHref: string;
}) {
  const [kind, setKind] = useState(initial.kind || "conge");
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const current = kinds.find((k) => k.key === kind) ?? kinds[0];
  const span = start && end && end >= start ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 : 0;

  return (
    <form action={action}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-navy-100 bg-white px-5 py-4 sm:px-6">
        <div>
          <h2 id="leave-title" className="text-lg font-bold text-navy">Nouvelle demande</h2>
          <p className="text-sm text-navy-600/70">Elle sera envoyée à votre responsable pour validation.</p>
        </div>
        <Link href={closeHref} scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Fermer"><X size={18} /></Link>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <fieldset>
          <legend className="label">Type de demande</legend>
          <input type="hidden" name="kind" value={kind} />
          <div className="grid gap-2 sm:grid-cols-2">
            {kinds.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                aria-pressed={kind === k.key}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${kind === k.key ? "border-navy bg-navy-50/80 ring-1 ring-navy" : "border-navy-100 hover:bg-navy-50/50"}`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${kind === k.key ? "bg-navy text-white" : "bg-navy-50 text-navy-600"}`}>{ICON[k.key]}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-navy">{k.label}</span>
                  <span className="block text-xs text-navy-600/70">{k.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Du</span>
            <input type="date" name="start" className="input" value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} required />
          </label>
          <label className="block"><span className="label">Au (inclus)</span>
            <input type="date" name="end" className="input" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>
        {span > 0 && (
          <p className="-mt-2 text-sm text-navy-600/80">
            {span} jour{span > 1 ? "s" : ""} calendaire{span > 1 ? "s" : ""}. Seuls les jours travaillés (hors repos et fériés) sont décomptés.
            {current.countsLeave && balance && <> Solde actuel : <b className={balance.left > 0 ? "text-navy" : "text-red-700"}>{balance.left} j</b> sur {balance.entitled}.</>}
          </p>
        )}

        {current.needsDoc && (
          <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/50 p-4">
            <label htmlFor="leave-doc" className="label flex items-center gap-2"><FileUp size={16} /> Certificat médical <span className="font-normal text-red-700">(obligatoire)</span></label>
            <input id="leave-doc" type="file" name="doc" accept="application/pdf,image/*" required className="block w-full text-sm text-navy-700" />
            <p className="mt-1 text-xs text-navy-600/65">PDF ou photo, 15 Mo maximum.</p>
          </div>
        )}
        {!current.needsDoc && (
          <details className="rounded-xl border border-navy-100 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-navy-700">Joindre un justificatif (facultatif)</summary>
            <input type="file" name="doc" accept="application/pdf,image/*" className="mt-3 block w-full text-sm text-navy-700" />
          </details>
        )}

        <label className="block"><span className="label">Motif {kind === "autre" ? <span className="font-normal text-red-700">(obligatoire)</span> : <span className="font-normal text-navy-600/60">(facultatif)</span>}</span>
          <textarea name="reason" className="input" rows={3} required={kind === "autre"} placeholder="Précisions utiles pour votre responsable" />
        </label>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
        <Link href={closeHref} scroll={false} className="btn-ghost">Annuler</Link>
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-gold" disabled={pending}>
      {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />} Envoyer la demande
    </button>
  );
}
