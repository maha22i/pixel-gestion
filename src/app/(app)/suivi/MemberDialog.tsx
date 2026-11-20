"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { PRIORITY, TASK_STATUS, dateFr, taskSignal } from "@/lib/format";

export type FollowPerson = {
  id: number;
  name: string;
  color: string;
  jobTitle: string;
  assigned: number;
  doing: number;
  done: number;
  late: number;
  load: number;
};

export type FollowTask = {
  id: number;
  userId: number;
  title: string;
  status: string;
  dueDate: string | null;
  priority: string;
  project: string | null;
};

export type FollowEvent = {
  actorId: number;
  at: string;
  kind: string;
  detail: string | null;
  title: string;
};

const EVENT_KIND: Record<string, string> = {
  creation: "Création",
  assignation: "Assignation",
  modification: "Modification",
  statut: "Statut",
  renvoi: "Renvoi",
  validation: "Validation",
  piece: "Pièce jointe",
  commentaire: "Commentaire",
  checklist: "Checklist",
  date: "Date",
  temps: "Temps passé",
};

function eventText(kind: string, detail: string | null, people: FollowPerson[]) {
  const label = EVENT_KIND[kind] ?? kind;
  if (!detail) return label;
  if (kind === "statut") {
    const [status, ...rest] = detail.split(" — ");
    const name = TASK_STATUS[status] ?? status;
    return rest.length ? `${label} · ${name} — ${rest.join(" — ")}` : `${label} · ${name}`;
  }
  if (kind === "assignation") {
    const names = detail.split(",").map((part) => {
      const id = Number(part.trim());
      return people.find((p) => p.id === id)?.name ?? part.trim();
    }).join(", ");
    return `${label} · ${names}`;
  }
  return `${label} · ${detail}`;
}

function setMemberParam(id: number | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("membre", String(id));
  else url.searchParams.delete("membre");
  const qs = url.searchParams.toString();
  window.history.replaceState(null, "", url.pathname + (qs ? `?${qs}` : ""));
}

export function TeamFollow({
  people,
  tasks,
  events,
  today,
  initialMemberId,
}: {
  people: FollowPerson[];
  tasks: FollowTask[];
  events: FollowEvent[];
  today: string;
  initialMemberId: number;
}) {
  const [openId, setOpenId] = useState<number | null>(initialMemberId || null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const person = people.find((p) => p.id === openId) ?? null;

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpenId(null);
    setMemberParam(null);
  }, []);

  const open = useCallback((id: number) => {
    setOpenId(id);
    setMemberParam(id);
  }, []);

  useEffect(() => {
    if (!person) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [person, close]);

  const memberTasks = person ? tasks.filter((t) => t.userId === person.id) : [];
  const memberEvents = person ? events.filter((e) => e.actorId === person.id) : [];

  return (
    <>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
          <p className="h-section">Équipe</p>
          <p className="text-xs text-navy-600/60">Une ligne ouvre le détail</p>
        </div>
        <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Membre</th>
              <th>Assignées</th>
              <th>En cours</th>
              <th>Terminées</th>
              <th>Retard</th>
              <th>Charge 7 j</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr
                key={p.id}
                tabIndex={0}
                role="button"
                aria-haspopup="dialog"
                aria-label={`Voir le suivi de ${p.name}`}
                onClick={() => open(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(p.id);
                  }
                }}
                className={`clickable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70 ${p.load >= 8 ? "bg-gold-50" : p.assigned === 0 ? "bg-navy-50" : ""}`}
              >
                <td>
                  <span className="font-bold text-navy-700">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: p.color }} />
                    {p.name}
                  </span>
                  {p.jobTitle && <div className="text-xs text-navy-600/70">{p.jobTitle}</div>}
                </td>
                <td>{p.assigned}</td>
                <td>{p.doing}</td>
                <td>{p.done}</td>
                <td className={p.late ? "font-bold text-red-700" : ""}>{p.late}</td>
                <td>{p.load}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {mounted && person && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <button type="button" className="absolute inset-0 cursor-default bg-navy/50 backdrop-blur-[2px]" aria-label="Fermer la fenêtre" onClick={close} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="member-modal relative z-10 flex max-h-[min(820px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_30px_80px_-30px_rgba(24,34,44,0.65)] outline-none"
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const root = panelRef.current;
              if (!root) return;
              const items = [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
              if (items.length === 0) return;
              const first = items[0];
              const last = items[items.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gold/25 px-5 py-4 sm:px-6">
              <div className="min-w-0 border-l-4 border-gold pl-3">
                <h2 id={titleId} className="truncate text-xl font-bold tracking-tight text-navy">
                  <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: person.color }} />
                  {person.name}
                </h2>
                {person.jobTitle && <p className="mt-0.5 text-sm text-navy-600/80">{person.jobTitle}</p>}
              </div>
              <button type="button" className="btn-ghost btn-sm shrink-0" onClick={close}>Fermer</button>
            </div>

            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Stat label="Assignées" value={person.assigned} />
                <Stat label="En cours" value={person.doing} />
                <Stat label="Terminées" value={person.done} tone="green" />
                <Stat label="Retard" value={person.late} tone={person.late ? "red" : "navy"} />
                <Stat label="Charge 7 j" value={person.load} tone={person.load >= 8 ? "gold" : "navy"} />
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <p className="h-section">Tâches · {memberTasks.length}</p>
                <Link href={`/taches?personne=${person.id}`} className="text-sm font-bold text-navy-700 underline-offset-2 hover:text-gold-600 hover:underline">
                  Ouvrir dans Tâches
                </Link>
              </div>
              {memberTasks.length === 0 ? (
                <p className="mt-3 text-sm text-navy-600/75">Aucune tâche assignée.</p>
              ) : (
                <ul className="mt-3 divide-y divide-gold/15 overflow-hidden rounded-xl border border-gold/20">
                  {memberTasks.map((t) => {
                    const signal = taskSignal(t.status, t.dueDate, today);
                    return (
                      <li key={t.id} className={signal.wash}>
                        <Link href={`/taches/${t.id}?back=${encodeURIComponent(`/suivi?membre=${person.id}`)}`} className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-gold/10">
                          <span className={`h-8 w-1 shrink-0 rounded-full ${signal.bar}`} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold text-navy">{t.title}</span>
                            <span className="mt-0.5 block text-xs text-navy-600/70">
                              {t.project || "Sans projet"}
                              {" · "}
                              <span className={signal.date}>{dateFr(t.dueDate)}</span>
                              {t.priority !== "normale" && t.priority !== "basse" ? ` · ${PRIORITY[t.priority] ?? t.priority}` : ""}
                            </span>
                          </span>
                          <span className={signal.badge}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                            {signal.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="h-section mb-3 mt-6">Activité récente</p>
              {memberEvents.length === 0 ? (
                <p className="text-sm text-navy-600/75">Aucune activité récente.</p>
              ) : (
                <ul className="space-y-2">
                  {memberEvents.map((a, i) => (
                    <li key={`${a.at}-${i}`} className="text-sm text-navy-800">
                      <span className="text-navy-600/70">{new Date(a.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                      {" · "}
                      <span className="font-bold">{a.title}</span>
                      {" · "}
                      {eventText(a.kind, a.detail, people)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Stat({ label, value, tone = "navy" }: { label: string; value: number; tone?: "navy" | "gold" | "red" | "green" }) {
  const toneCls = { navy: "text-navy", gold: "text-amber-700", red: "text-red-700", green: "text-emerald-700" }[tone];
  return (
    <div className="rounded-xl bg-navy-50/70 px-3 py-2.5">
      <p className="h-section">{label}</p>
      <p className={`mt-1 text-2xl font-bold leading-none tabular-nums ${toneCls}`}>{value}</p>
    </div>
  );
}
