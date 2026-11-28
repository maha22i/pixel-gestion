"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Repeat } from "lucide-react";
import { PoolTray } from "./PoolTray";
import { Avatar } from "@/components/ui";
import { allowDrop, moveTaskRequest, startDrag, STATUS_CHIP, type PlanAbsence, type PlanDay, type PlanPerson, type PlanTask } from "./types";

/** Vue « Équipe » : une ligne par personne, une colonne par jour. */
export function PlanningTeam({
  days, today, people, tasks, absences, write, back, personHref, dayHref,
}: {
  days: PlanDay[];
  today: string;
  people: PlanPerson[];
  tasks: PlanTask[];
  absences: PlanAbsence[];
  write: boolean;
  back: string;
  personHref: Record<number, string>;
  dayHref: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const pool = tasks.filter((t) => !t.due);
  const scheduled = tasks.filter((t) => t.due);
  const unassigned = scheduled.filter((t) => t.assignees.length === 0);

  async function drop(e: React.DragEvent, personId: number | null, iso: string) {
    e.preventDefault();
    setOver(null);
    if (!write) return;
    const id = Number(e.dataTransfer.getData("id"));
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const reassign = personId !== null && !task.assignees.some((a) => a.id === personId);
    if (task.due === iso && !reassign) return;
    setBusy(id);
    await moveTaskRequest({ id, due: iso, userId: reassign ? personId! : undefined, back });
    setBusy(null);
    router.refresh();
  }

  const chip = (t: PlanTask) => (
    <li
      key={t.id}
      title={`${t.title}${t.projectTitle ? ` · ${t.projectTitle}` : ""}${t.assignees.length > 1 ? ` · avec ${t.assignees.map((a) => a.name).join(", ")}` : ""}`}
      className={`rounded-lg border bg-white  transition hover:border-gold/60  ${write ? "cursor-grab active:cursor-grabbing" : ""} ${
        t.late ? "border-red-200 bg-red-50/70" : `border-navy-100 ${STATUS_CHIP[t.status] ?? ""}`
      } ${busy === t.id ? "animate-pulse opacity-50" : ""}`}
    >
      <Link href={`/taches/${t.id}`} draggable={write} onDragStart={(e) => startDrag(e, t.id)} className="block px-2 py-1.5 text-xs">
        <span className="line-clamp-3 font-bold text-navy">
          {t.recurring && <Repeat size={11} className="mr-1 inline text-gold-600" aria-label="Production récurrente" />}
          {t.time && <span className={`mr-1 tabular-nums ${t.late ? "text-red-700" : "text-navy-600"}`}>{t.time.slice(0, 5)}</span>}
          {t.title}
        </span>
        {t.projectTitle && <span className="mt-0.5 block truncate text-[11px] text-navy-600/65">{t.projectTitle}</span>}
      </Link>
    </li>
  );

  const absenceOn = (pid: number, iso: string) => absences.find((a) => a.userId === pid && a.start <= iso && iso <= a.end);
  const cellBase = "min-h-[84px] border-l border-t border-navy-100/80 p-1.5 align-top transition-colors";

  const row = (p: PlanPerson | null) => {
    const mine = p ? scheduled.filter((t) => t.assignees.some((a) => a.id === p.id)) : unassigned;
    const late = mine.filter((t) => t.late).length;
    return (
      <div key={p?.id ?? "none"} className="contents">
        <div className="sticky left-0 z-[1] border-t border-navy-100/80 bg-white p-2.5">
          {p ? (
            <Link href={personHref[p.id]} className="group flex items-center gap-2 sm:gap-2.5" title={`Voir le planning de ${p.name}`}>
              <Avatar name={p.name} color={p.color} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-navy group-hover:text-gold-600">
                  <span className="sm:hidden">{p.name.split(" ")[0]}</span>
                  <span className="hidden sm:inline">{p.name}</span>
                </span>
                <span className="block truncate text-[11px] text-navy-600/65">
                  {mine.length} tâche{mine.length > 1 ? "s" : ""}{late ? <b className="text-red-700"> · {late} en retard</b> : ""}
                </span>
              </span>
              <ChevronRight size={15} className="hidden shrink-0 text-navy-600/30 group-hover:text-navy sm:block" />
            </Link>
          ) : (
            <span className="block">
              <span className="block text-sm font-bold text-navy-600">Non assignées</span>
              <span className="block text-[11px] text-navy-600/65">{mine.length} tâche(s) sans personne</span>
            </span>
          )}
        </div>
        {days.map((d) => {
          const key = `${p?.id ?? "none"}|${d.iso}`;
          const abs = p ? absenceOn(p.id, d.iso) : undefined;
          const list = mine.filter((t) => t.due === d.iso).sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
          return (
            <div
              key={key}
              onDragOver={(e) => { if (!write) return; allowDrop(e); setOver(key); }}
              onDragLeave={() => setOver((o) => (o === key ? null : o))}
              onDrop={(e) => drop(e, p?.id ?? null, d.iso)}
              className={`${cellBase} ${d.iso === today ? "bg-gold/[0.07]" : d.rest ? "bg-navy-50/60" : "bg-white"} ${over === key ? "!bg-gold/20 ring-2 ring-inset ring-gold" : ""} ${
                abs ? "bg-[repeating-linear-gradient(135deg,rgba(56,189,248,0.10)_0_6px,transparent_6px_12px)]" : ""
              }`}
            >
              {abs && <span className="badge-blue mb-1">{abs.label}</span>}
              <ul className="space-y-1">{list.map(chip)}</ul>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      {write && <PoolTray tasks={pool} busy={busy} hint="Glissez une tâche dans la case d'une personne et d'un jour." />}

      <div className="card overflow-x-auto">
        <div className="grid min-w-[900px] [--plan-name:136px] sm:min-w-[980px] sm:[--plan-name:200px]" style={{ gridTemplateColumns: `var(--plan-name) repeat(${days.length}, minmax(108px, 1fr))` }}>
          <div className="sticky left-0 top-0 z-[2] bg-white p-2.5 text-[11px] font-bold uppercase tracking-wider text-navy-600/60">Équipe</div>
          {days.map((d) => (
            <Link
              key={d.iso}
              href={dayHref[d.iso]}
              className={`border-l border-navy-100/80 px-2 py-2 text-center transition hover:bg-gold/10 ${d.iso === today ? "bg-gold/15" : d.rest ? "bg-navy-50/60" : ""}`}
              title="Voir la journée"
            >
              <span className="block text-[11px] font-bold uppercase tracking-wider text-navy-600/65">{d.weekday}{d.rest ? " · repos" : ""}</span>
              <span className={`mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm font-bold ${d.iso === today ? "bg-gold text-navy-900" : "text-navy"}`}>{d.dayNum}</span>
            </Link>
          ))}
          {people.map((p) => row(p))}
          {unassigned.length > 0 && row(null)}
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-600/70">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-red-200 bg-red-50" /> En retard</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded ring-1 ring-sky-300" /> En cours</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[repeating-linear-gradient(135deg,rgba(56,189,248,0.25)_0_3px,transparent_3px_6px)]" /> Absence</span>
        <span>Cliquez sur un nom pour voir son planning heure par heure, sur un jour pour la vue journée.</span>
      </p>
    </div>
  );
}
