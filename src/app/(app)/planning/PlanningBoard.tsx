"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat, X } from "lucide-react";
import { PoolTray } from "./PoolTray";
import { Avatar } from "@/components/ui";
import { allowDrop, moveTaskRequest, startDrag, STATUS_CHIP, type PlanAbsence, type PlanDay, type PlanPerson, type PlanTask } from "./types";

/** Vue heure par heure (semaine ou jour), pour toute l'équipe ou une personne. */
export function PlanningBoard({
  mode, days, today, people, tasks, projects, write, back, focusPersonId, dayHref, absences,
}: {
  mode: "semaine" | "jour";
  days: PlanDay[];
  today: string;
  people: PlanPerson[];
  tasks: PlanTask[];
  projects: { id: number; title: string }[];
  write: boolean;
  back: string;
  focusPersonId: number | null;
  dayHref: Record<string, string>;
  absences: PlanAbsence[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<{ id: number; iso: string; hour: number | null; title: string } | null>(null);
  const [personId, setPersonId] = useState<number | "">("");
  const [busy, setBusy] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const scheduled = useMemo(() => tasks.filter((t) => t.due && days.some((d) => d.iso === t.due)), [tasks, days]);
  const hourOf = (t: PlanTask) => (t.time ? Number(t.time.slice(0, 2)) : null);
  // Plage affichée : 06h–21h, élargie si une tâche tombe en dehors.
  const hours = useMemo(() => {
    const used = scheduled.map(hourOf).filter((h): h is number => h !== null);
    const from = Math.min(6, ...used);
    const to = Math.max(21, ...used);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [scheduled]);

  useEffect(() => {
    const row = scroller.current?.querySelector('[data-hour="7"]') as HTMLElement | null;
    const head = scroller.current?.querySelector('[data-head]') as HTMLElement | null;
    if (row && scroller.current) scroller.current.scrollTop = Math.max(0, row.offsetTop - (head?.offsetHeight ?? 60));
  }, [mode, days]);

  async function place(id: number, iso: string, hour: number | null, userId?: number) {
    setBusy(id);
    await moveTaskRequest({ id, due: iso, time: hour === null ? undefined : `${String(hour).padStart(2, "0")}:00`, userId, back });
    setBusy(null);
    setPending(null);
    router.refresh();
  }

  function drop(e: React.DragEvent, iso: string, hour: number | null) {
    e.preventDefault();
    if (!write) return;
    const id = Number(e.dataTransfer.getData("id"));
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (focusPersonId) {
      // Planning d'une personne : la tâche lui est confiée directement.
      place(id, iso, hour, task.assignees.some((a) => a.id === focusPersonId) ? undefined : focusPersonId);
    } else if (task.assignees.length) {
      place(id, iso, hour);
    } else {
      setPersonId("");
      setPending({ id, iso, hour, title: task.title });
    }
  }

  async function unschedule(id: number) {
    setBusy(id);
    await moveTaskRequest({ id, unset: true, back });
    setBusy(null);
    router.refresh();
  }

  const card = (t: PlanTask) => {
    const color = t.assignees[0]?.color ?? "#64748B";
    return (
      <div
        key={t.id}
        className={`group relative mb-1 rounded-md border-l-[3px] bg-white px-1.5 py-1 text-xs  ring-1 ring-navy-100 ${t.late ? "bg-red-50 ring-red-200" : STATUS_CHIP[t.status] ?? ""} ${busy === t.id ? "animate-pulse opacity-50" : ""}`}
        style={{ borderLeftColor: color }}
      >
        <Link href={`/taches/${t.id}`} draggable={write} onDragStart={(e) => startDrag(e, t.id)} className={`block pr-4 ${write ? "cursor-grab active:cursor-grabbing" : ""}`}>
          {t.recurring && <Repeat size={11} className="mr-0.5 inline text-gold-600" aria-label="Production récurrente" />}
          <span className={`font-bold tabular-nums ${t.late ? "text-red-700" : "text-navy-600"}`}>{t.time ? t.time.slice(0, 5) : ""}</span>{" "}
          <span className="font-bold text-navy">{t.title}</span>
          {t.projectTitle && <span className="block truncate text-[11px] text-navy-600/65">{t.projectTitle}</span>}
        </Link>
        {!focusPersonId && t.assignees.length > 0 && (
          <span className="mt-1 flex -space-x-1.5">
            {t.assignees.slice(0, 4).map((a) => <Avatar key={a.id} name={a.name} color={a.color} size={18} />)}
          </span>
        )}
        {write && (
          <button type="button" onClick={() => unschedule(t.id)} className="absolute right-0.5 top-0.5 hidden rounded p-0.5 text-navy-600/50 hover:bg-navy-50 hover:text-red-700 group-hover:block" aria-label={`Retirer « ${t.title} » du planning`} title="Retirer du planning">
            <X size={13} />
          </button>
        )}
      </div>
    );
  };

  const cols = days.length > 1 ? `52px repeat(${days.length}, minmax(112px, 1fr))` : "52px minmax(0, 1fr)";
  const dayCell = (d: PlanDay, hour: number | null, list: PlanTask[], extra = "") => (
    <div
      key={`${d.iso}-${hour ?? "x"}`}
      className={`border-l border-t border-navy-100/70 p-1 ${d.iso === today ? "bg-gold/[0.05]" : d.rest ? "bg-navy-50/50" : ""} ${extra}`}
      onDragOver={(e) => { if (write) allowDrop(e); }}
      onDrop={(e) => drop(e, d.iso, hour)}
    >
      {list.map(card)}
    </div>
  );
  const absentOn = (iso: string) => absences.find((a) => a.start <= iso && iso <= a.end);

  return (
    <div>
      {write && (
        <PoolTray
          tasks={tasks.filter((t) => !t.due)}
          projects={projects}
          busy={busy}
          onDropBack={unschedule}
          hint={focusPersonId ? "Glissez une tâche sur un créneau : elle sera confiée à cette personne." : "Glissez une tâche sur un créneau. Pour la retirer du planning, ramenez-la ici."}
        />
      )}

      <div ref={scroller} className="card max-h-[calc(100dvh-12rem)] min-h-[560px] overflow-auto">
        <div className="grid min-w-full" style={{ gridTemplateColumns: cols, minWidth: days.length > 1 ? 52 + days.length * 112 : undefined }}>
          {/* En-têtes de jours, avec les tâches du jour sans heure (toujours visibles) */}
          <div data-head className="sticky left-0 top-0 z-20 flex items-end justify-end border-b border-navy-100 bg-white px-1 pb-1.5 text-[10px] font-bold uppercase leading-tight text-navy-600/50">Sans heure</div>
          {days.map((d) => {
            const abs = absentOn(d.iso);
            const untimed = scheduled.filter((t) => t.due === d.iso && hourOf(t) === null);
            return (
              <div
                key={d.iso}
                className={`sticky top-0 z-10 border-b border-l border-navy-100 px-1.5 pb-1.5 pt-2 ${d.iso === today ? "bg-[#fdf3df]" : "bg-white"}`}
                onDragOver={(e) => { if (write) allowDrop(e); }}
                onDrop={(e) => drop(e, d.iso, null)}
              >
                <Link href={dayHref[d.iso] ?? "#"} className="mb-1 block rounded-lg text-center transition hover:bg-gold/10" title="Voir la journée">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-navy-600/65">{d.weekday}{d.rest ? " · repos" : ""}</span>
                  <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-sm font-bold ${d.iso === today ? "bg-gold text-navy-900" : "text-navy"}`}>{d.dayNum}</span>
                </Link>
                {abs && <span className="badge-blue mb-1 w-full justify-center">{abs.label}</span>}
                {untimed.map(card)}
              </div>
            );
          })}

          {hours.map((hour) => (
            <div key={hour} className="contents">
              <div data-hour={hour} className="sticky left-0 z-[1] border-t border-navy-100/70 bg-white px-1.5 py-1 text-right text-xs tabular-nums text-navy-600/60">{String(hour).padStart(2, "0")}:00</div>
              {days.map((d) => dayCell(d, hour, scheduled.filter((t) => t.due === d.iso && hourOf(t) === hour), "min-h-[46px]"))}
            </div>
          ))}
        </div>
        {scheduled.length === 0 && (
          <p className="sticky left-0 px-4 py-3 text-sm text-navy-600/70">Aucune tâche datée sur cette période.</p>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" onClick={() => setPending(null)}>
          <div className="card card-pad w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-navy">Qui fait « {pending.title} » ?</p>
            <p className="text-sm text-navy-600">{pending.iso.split("-").reverse().join("/")}{pending.hour !== null ? ` à ${String(pending.hour).padStart(2, "0")}:00` : ""}</p>
            <div className="grid max-h-72 gap-1.5 overflow-y-auto">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersonId(p.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm ${personId === p.id ? "border-gold bg-gold/10" : "border-navy-100 hover:bg-navy-50"}`}
                >
                  <Avatar name={p.name} color={p.color} size={26} />
                  <span><span className="font-bold text-navy">{p.name}</span>{p.jobTitle && <span className="block text-xs text-navy-600/70">{p.jobTitle}</span>}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" disabled={!personId} onClick={() => place(pending.id, pending.iso, pending.hour, Number(personId))}>Placer</button>
              <button type="button" className="btn-ghost" onClick={() => setPending(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
