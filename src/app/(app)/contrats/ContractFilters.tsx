"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";

/** Recherche + client : appliqués automatiquement (sans bouton « Filtrer »). */
export function ContractFilters({ clients }: { clients: { id: number; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();
  const first = useRef(true);

  function apply(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = window.setTimeout(() => apply({ q: q.trim() }), 280);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <label className="relative min-w-[14rem] flex-1 sm:max-w-sm">
        <span className="sr-only">Rechercher un contrat</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-600/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="N°, client, intitulé…"
          className="input pl-9 pr-9"
          type="search"
        />
        {pending ? (
          <LoaderCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-navy-600/50" />
        ) : q ? (
          <button type="button" onClick={() => setQ("")} aria-label="Effacer la recherche" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-600/50 hover:text-navy">
            <X size={16} />
          </button>
        ) : null}
      </label>
      <select
        aria-label="Filtrer par client"
        className="input w-full sm:w-56"
        value={params.get("client") ?? ""}
        onChange={(e) => apply({ client: e.target.value })}
      >
        <option value="">Tous les clients</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}
