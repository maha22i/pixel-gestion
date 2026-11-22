"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { ItemForm } from "./ItemForm";

/** Bouton « Nouvel élément » qui ouvre le formulaire d'ajout dans une fenêtre. */
export function NewItemButton({
  action, categories, label = "Nouvel élément", className = "btn-primary", autoOpen = false,
}: {
  action: (fd: FormData) => void;
  categories: string[];
  label?: string;
  className?: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const ok = useSearchParams().get("ok");

  useEffect(() => setMounted(true), []);
  // Après l'ajout (redirection vers ?ok=1), on referme la fenêtre.
  useEffect(() => {
    if (ok) setOpen(false);
  }, [ok]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => panel.current?.querySelector<HTMLInputElement>("input[name=name]")?.focus(), 30);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      trigger.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={trigger} type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plus size={16} aria-hidden /> {label}
      </button>
      {mounted && open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <button type="button" className="absolute inset-0 cursor-default bg-navy/50 backdrop-blur-[2px]" aria-label="Fermer" onClick={() => setOpen(false)} />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="member-modal relative z-10 flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/80 bg-white shadow-[0_30px_80px_-30px_rgba(24,34,44,0.65)] sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gold/25 px-5 py-4 sm:px-6">
              <div className="border-l-4 border-gold pl-3">
                <h2 id={titleId} className="text-xl font-bold tracking-tight text-navy">Nouvel élément</h2>
                <p className="text-sm text-navy-600/75">Il sera proposé dans les devis.</p>
              </div>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-navy-600/70 hover:bg-navy-50 hover:text-navy" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              <ItemForm
                action={action}
                categories={categories}
                idPrefix="new-item"
                cancel={<button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Annuler</button>}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
