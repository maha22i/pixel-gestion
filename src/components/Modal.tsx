"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Fenêtre modale pilotée par l'URL : elle s'affiche quand la page la rend, et « fermer »
 * revient à `closeHref` (bouton ×, touche Échap ou clic sur le fond).
 */
export function Modal({
  closeHref, labelledBy, children, width = "max-w-3xl",
}: {
  closeHref: string;
  labelledBy: string;
  children: React.ReactNode;
  width?: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.push(closeHref, { scroll: false }); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [closeHref, router]);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-navy-900/50 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) router.push(closeHref, { scroll: false }); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`member-modal mt-auto flex max-h-[94dvh] w-full ${width} flex-col overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl ring-1 ring-navy-100 sm:my-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl`}
      >
        {children}
      </div>
    </div>
  );
}
