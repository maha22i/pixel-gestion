"use client";
import { useEffect, useState } from "react";
import { CalendarPlus, ChevronDown, GripVertical } from "lucide-react";
import { allowDrop, startDrag, type PlanTask } from "./types";

const KEY = "pn-planning-pool-open";

/**
 * Bandeau « À planifier » au-dessus du calendrier : tâches sans date, à glisser dans le planning.
 * Repliable (le choix est mémorisé) pour laisser toute la place au calendrier.
 */
export function PoolTray({
  tasks, projects, busy, onDropBack, hint,
}: {
  tasks: PlanTask[];
  projects?: { id: number; title: string }[];
  busy: number | null;
  /** Déposer une tâche planifiée sur le bandeau la retire du planning. */
  onDropBack?: (id: number) => void;
  hint: string;
}) {
  const [open, setOpen] = useState(true);
  const [projectId, setProjectId] = useState<number | "all">("all");
  const [over, setOver] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "0") setOpen(false); } catch { /* stockage indisponible */ }
  }, []);
  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem(KEY, o ? "0" : "1"); } catch { /* stockage indisponible */ }
      return !o;
    });
  };

  const list = tasks.filter((t) => projectId === "all" || t.projectId === projectId);

  return (
    <section
      className={`card mb-4 transition-colors ${over ? "ring-2 ring-gold" : ""}`}
      onDragOver={(e) => { if (!onDropBack) return; allowDrop(e); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!onDropBack) return;
        e.preventDefault();
        const id = Number(e.dataTransfer.getData("id"));
        if (id && !tasks.some((t) => t.id === id)) onDropBack(id);
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-2 text-sm font-bold text-navy">
          <CalendarPlus size={16} className="text-gold-600" />
          À planifier
          <span className="rounded-full bg-gold-100 px-2 text-xs text-amber-900">{tasks.length}</span>
          <ChevronDown size={16} className={`text-navy-600/60 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open && projects && projects.length > 0 && (
          <select className="input h-8 w-auto py-0 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="Filtrer par projet">
            <option value="all">Tous les projets</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
        <p className="ml-auto hidden text-xs text-navy-600/65 md:block">{hint}</p>
      </div>
      {open && (
        <div className="border-t border-navy-100/70 px-4 pb-3 pt-2.5">
          {list.length === 0 ? (
            <p className="text-sm text-navy-600/60">{tasks.length === 0 ? "Tout est planifié." : "Aucune tâche à planifier pour ce projet."}</p>
          ) : (
            <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {list.map((t) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => startDrag(e, t.id)}
                  className={`flex w-56 shrink-0 cursor-grab items-start gap-1.5 rounded-lg border border-dashed border-navy-200 bg-navy-50/50 px-2 py-1.5 text-xs transition hover:border-gold/60 hover:bg-white active:cursor-grabbing ${busy === t.id ? "opacity-50" : ""}`}
                >
                  <GripVertical size={14} className="mt-0.5 shrink-0 text-navy-600/40" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-bold text-navy">{t.title}</span>
                    <span className="block truncate text-[11px] text-navy-600/65">
                      {t.projectTitle ?? "Sans projet"}{t.assignees.length ? ` · ${t.assignees.map((a) => a.name.split(" ")[0]).join(", ")}` : " · non assignée"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
