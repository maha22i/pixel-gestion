"use client";
import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Formulaire de filtres qui s'applique tout seul : les listes, cases et boutons radio
 * mettent l'URL à jour immédiatement, la recherche texte après une courte pause.
 * Les valeurs vides sont retirées de l'URL. Sans JavaScript, un bouton « Filtrer » reste disponible.
 * (Utilisé aussi par /catalogue.)
 */
export function AutoFilter({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [pending, start] = useTransition();

  const apply = () => {
    const form = ref.current;
    if (!form) return;
    const sp = new URLSearchParams();
    for (const [k, v] of new FormData(form)) {
      if (typeof v === "string" && v.trim() !== "") sp.append(k, v.trim());
    }
    const qs = sp.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // Garde les champs alignés sur l'URL (lien « Effacer les filtres », retour arrière…)
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || !el.name) continue;
      if (el === document.activeElement && el instanceof HTMLInputElement && el.type !== "radio" && el.type !== "checkbox") continue;
      const value = params.get(el.name) ?? "";
      if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) el.checked = el.value === value;
      else if (el instanceof HTMLInputElement && el.type === "hidden") continue;
      else el.value = value;
    }
  }, [params]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <form
      ref={ref}
      role="search"
      data-pending={pending || undefined}
      className={`group/filters ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        window.clearTimeout(timer.current);
        apply();
      }}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        window.clearTimeout(timer.current);
        if (t instanceof HTMLInputElement && (t.type === "search" || t.type === "text")) timer.current = window.setTimeout(apply, 280);
        else apply();
      }}
    >
      {children}
      <noscript><button className="btn-ghost">Filtrer</button></noscript>
    </form>
  );
}

/** Petit indicateur « mise à jour… » à placer dans un <AutoFilter>. */
export function FilterPending() {
  return (
    <span className="pointer-events-none hidden items-center gap-1.5 text-xs font-bold text-navy-600/70 group-data-[pending]/filters:inline-flex" aria-live="polite">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-navy-200 border-t-gold" />
      Mise à jour…
    </span>
  );
}
