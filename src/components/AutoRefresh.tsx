"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Recharge les données serveur de la page à intervalle régulier, seulement quand l'onglet est visible et qu'aucun champ n'est en cours de saisie. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
