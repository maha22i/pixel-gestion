"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

type Task = {
  id: number;
  title: string;
  due: string | null;
  time: string | null;
  userId: number | null;
  userName: string | null;
  projectId: number | null;
  projectTitle: string | null;
  color: string;
};

export function PlanningBoard({
  mode, days, today, people, tasks, projects, write, back,
}: {
  mode: "semaine" | "jour";
  days: { iso: string; label: string }[];
  today: string;
  people: { id: number; name: string; color: string; jobTitle: string | null }[];
  tasks: Task[];
  projects: { id: number; title: string }[];
  write: boolean;
  back: string;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<number | "all">(projects[0]?.id ?? "all");
  const [pending, setPending] = useState<{ id: number; iso: string; hour: number; title: string } | null>(null);
  const [personId, setPersonId] = useState<number | "">("");
  const shownDays = mode === "jour" ? days.slice(0, 1) : days;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = scroller.current?.querySelector('[data-hour="9"]') as HTMLElement | null;
    if (row && scroller.current) scroller.current.scrollTop = row.offsetTop - 40;
  }, [mode, days]);

  const pool = useMemo(() => {
    const seen = new Set<number>();
    return tasks.filter((t) => {
      if (t.due) return false;
      if (projectId !== "all" && t.projectId !== projectId) return false;
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [tasks, projectId]);

  function drop(e: React.DragEvent, iso: string, hour: number) {
    if (!write) return;
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("id"));
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setPersonId("");
    setPending({ id, iso, hour, title: task.title });
  }

  function unschedule(id: number) {
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("unset", "1");
    fd.set("ajax", "1");
    fd.set("back", back);
    fetch("/planning/deplacer", { method: "POST", body: fd }).then(() => router.refresh());
  }

  function confirmPlace() {
    if (!pending || !personId) return;
    const fd = new FormData();
    fd.set("id", String(pending.id));
    fd.set("dueDate", pending.iso);
    fd.set("dueTime", `${String(pending.hour).padStart(2, "0")}:00`);
    fd.set("userId", String(personId));
    fd.set("ajax", "1");
    fd.set("back", back);
    fetch("/planning/deplacer", { method: "POST", body: fd }).then(() => {
      setPending(null);
      router.refresh();
    });
  }

  function inSlot(t: Task, iso: string, hour: number) {
    if (t.due !== iso) return false;
    const h = Number((t.time ?? "09:00").slice(0, 2));
    return h === hour;
  }

  const visible = (_t: Task) => true;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr]">
      <aside
        className="card card-pad space-y-3 lg:sticky lg:top-4"
        onDragOver={(e) => write && e.preventDefault()}
        onDrop={(e) => {
          if (!write) return;
          e.preventDefault();
          const id = Number(e.dataTransfer.getData("id"));
          if (id) unschedule(id);
        }}
      >
        <p className="font-bold text-navy">Tâches du projet</p>
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value === "all" ? "all" : Number(e.target.value))}>
          <option value="all">Tous les projets</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <p className="text-xs text-navy-600/70">{write ? "Glisse une tâche du calendrier ici pour la remettre dans le projet. Sur le calendrier, « Retirer » fait la même chose." : "Vos tâches planifiées sont dans le calendrier."}</p>
        <ul className="max-h-64 space-y-1 overflow-y-auto lg:max-h-[70vh]">
          {pool.length === 0 && <li className="text-sm text-navy-600/60">Aucune tâche dans ce projet.</li>}
          {pool.map((t) => (
            <li
              key={t.id}
              draggable={write}
              onDragStart={(e) => e.dataTransfer.setData("id", String(t.id))}
              className="cursor-grab rounded-lg border border-navy-100 px-2 py-1.5 text-sm"
              style={{ borderLeft: `4px solid ${t.color}` }}
            >
              <span className="font-bold">{t.title}</span>
              <span className="block text-xs text-navy-600/70">
                {t.projectTitle ?? "Sans projet"} · {t.userName ?? "Non assignée"}
                {t.due ? ` · ${t.due.slice(8, 10)}/${t.due.slice(5, 7)} ${t.time ?? ""}` : " · à placer"}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      <div ref={scroller} className="card h-[calc(100dvh-13.5rem)] max-h-[880px] overflow-auto lg:h-[72vh] lg:min-h-[620px]">
        {shownDays.length > 1 && <p className="sticky left-0 px-3 pt-3 text-xs font-bold text-navy-600/70 lg:hidden">Glissez horizontalement pour voir toute la semaine, ou passez en vue Jour.</p>}
        <div className="grid min-w-full" style={{ gridTemplateColumns: shownDays.length > 1 ? `44px repeat(${shownDays.length}, minmax(104px, 1fr))` : "44px minmax(0, 1fr)" }}>
          <div className="sticky top-0 z-10 border-b bg-white p-2" />
          {shownDays.map((d) => (
            <div key={d.iso} className={`sticky top-0 z-10 truncate border-b border-l p-2 text-xs font-bold sm:text-sm ${d.iso === today ? "bg-gold/20" : "bg-white"}`}>{d.label}{d.iso === today ? " · aujourd'hui" : ""}</div>
          ))}
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div data-hour={hour} className="border-t px-1 py-1 text-right text-xs text-navy-600/60">{String(hour).padStart(2, "0")}:00</div>
              {shownDays.map((d) => (
                <div
                  key={d.iso + hour}
                  className={`min-h-10 border-l border-t p-1 ${d.iso === today ? "bg-gold/5" : ""}`}
                  onDragOver={(e) => write && e.preventDefault()}
                  onDrop={(e) => drop(e, d.iso, hour)}
                >
                  {tasks.filter((t) => visible(t) && inSlot(t, d.iso, hour)).map((t) => (
                    <div
                      key={t.id}
                      draggable={write}
                      onDragStart={(e) => e.dataTransfer.setData("id", String(t.id))}
                      className="mb-1 rounded px-1.5 py-1 text-xs text-white"
                      style={{ background: t.color }}
                    >
                      <span className="font-bold">{t.time ?? `${hour}:00`}</span> {t.title}
                      <span className="block opacity-90">{t.userName}</span>
                      {write && <button type="button" className="mt-1 underline" onClick={() => unschedule(t.id)}>Retirer</button>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {pending && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-navy/40 p-4">
          <div className="card card-pad w-full max-w-sm space-y-3">
            <p className="font-bold text-navy">Qui fait « {pending.title} » ?</p>
            <p className="text-sm text-navy-600">{pending.iso.split("-").reverse().join("/")} à {String(pending.hour).padStart(2, "0")}:00</p>
            <select className="input" value={personId} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Choisir une personne</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.jobTitle ? ` · ${p.jobTitle}` : ""}</option>)}
            </select>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" disabled={!personId} onClick={confirmPlace}>Placer</button>
              <button type="button" className="btn-ghost" onClick={() => setPending(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
