"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, FolderKanban, LoaderCircle, Search, X } from "lucide-react";

type Project = { id: number; title: string; client: string | null };
type Person = { id: number; name: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Barre de recherche et filtres de la liste des tâches (tout passe par l'adresse de la page). */
export function TaskFilters({ projects, people, showPerson, priorities }: {
  projects: Project[];
  people: Person[];
  showPerson: boolean;
  priorities: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    for (const k of ["page", "ok", "e"]) next.delete(k);
    const s = next.toString();
    start(() => router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false }));
  };

  // Recherche au fil de la frappe, sans recharger à chaque lettre.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => go({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative block w-full lg:w-auto lg:min-w-[260px] lg:flex-1">
        <span className="sr-only">Rechercher une tâche</span>
        {pending ? <LoaderCircle size={16} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-navy-600/50" />
          : <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-600/50" />}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go({ q: q.trim() || null }); }}
          placeholder="Rechercher une tâche, un projet, un client…"
          className="input pl-9 pr-8"
        />
        {q && <button type="button" onClick={() => { setQ(""); go({ q: null }); }} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-navy-600/60 hover:bg-navy-50" aria-label="Effacer la recherche"><X size={14} /></button>}
      </label>
      <ProjectPicker projects={projects} value={Number(params.get("projet")) || 0} onChange={(id) => go({ projet: id ? String(id) : null })} />
      {showPerson && (
        <select aria-label="Personne" className="input w-auto min-w-0 flex-1 sm:min-w-[150px] sm:flex-none" value={params.get("personne") ?? ""} onChange={(e) => go({ personne: e.target.value || null })}>
          <option value="">Toute l'équipe</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <select aria-label="Priorité" className="input w-auto min-w-0 flex-1 sm:min-w-[140px] sm:flex-none" value={params.get("priorite") ?? ""} onChange={(e) => go({ priorite: e.target.value || null })}>
        <option value="">Toute priorité</option>
        {Object.entries(priorities).reverse().map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

/** Choix d'un projet par saisie : utilisable avec des centaines de projets. */
function ProjectPicker({ projects, value, onChange }: { projects: Project[]; value: number; onChange: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const current = projects.find((p) => p.id === value);
  const list = useMemo(() => {
    const t = norm(text.trim());
    const hits = t ? projects.filter((p) => norm(`${p.title} ${p.client ?? ""}`).includes(t)) : projects;
    return hits.slice(0, 60);
  }, [projects, text]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => { setHi(0); }, [text]);

  const pick = (id: number) => { onChange(id); setOpen(false); setText(""); };

  return (
    <div ref={box} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setTimeout(() => input.current?.focus(), 0); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`input flex w-full items-center sm:w-auto sm:min-w-[190px] sm:max-w-[260px] items-center gap-2 text-left ${current ? "border-navy bg-navy-50/60 pr-9 font-semibold text-navy" : "text-navy-600"}`}
      >
        <FolderKanban size={15} className="shrink-0 text-navy-600/60" />
        <span className="min-w-0 flex-1 truncate">{current ? current.title : "Tous les projets"}</span>
        {!current && <ChevronDown size={15} className="shrink-0 text-navy-600/50" />}
      </button>
      {current && (
        <button type="button" aria-label="Retirer le filtre projet" onClick={() => pick(0)} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-navy-600 hover:bg-navy-100">
          <X size={13} />
        </button>
      )}
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-navy-100 bg-white shadow-[0_12px_32px_-12px_rgba(44,62,80,0.25)]">
          <div className="border-b border-navy-100 p-2">
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); if (list[hi]) pick(list[hi].id); }
                else if (e.key === "Escape") setOpen(false);
              }}
              placeholder={`Chercher parmi ${projects.length} projet${projects.length > 1 ? "s" : ""}…`}
              className="input"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {!text && (
              <li>
                <button type="button" onClick={() => pick(0)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${!value ? "font-bold text-navy" : "text-navy-700 hover:bg-navy-50"}`}>
                  {!value ? <Check size={14} /> : <span className="w-3.5" />} Tous les projets
                </button>
              </li>
            )}
            {list.map((p, i) => (
              <li key={p.id} role="option" aria-selected={p.id === value}>
                <button type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(p.id)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${i === hi ? "bg-navy-50" : ""}`}>
                  {p.id === value ? <Check size={14} className="mt-0.5 shrink-0 text-navy" /> : <span className="w-3.5 shrink-0" />}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-navy">{p.title}</span>
                    {p.client && <span className="block truncate text-xs text-navy-600/65">{p.client}</span>}
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-3 py-4 text-center text-sm text-navy-600/60">Aucun projet trouvé.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
