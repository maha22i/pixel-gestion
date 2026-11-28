"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, CalendarRange, Check, Clapperboard, Image as ImageIcon, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui";

type Person = { id: number; name: string; color: string; jobTitle: string | null };
type Item = { key: string; id?: number; label: string; perMonth: number; weekdays: number[]; startTime: string; endTime: string; typeId: number | null; assigneeIds: number[] };
export type PlanValue = { id?: number; projectId: number | null; name: string; startMonth: string; endMonth: string; items: Omit<Item, "key">[] };

const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const PRESETS = [
  { label: "Vidéo", perMonth: 4, weekdays: [2], startTime: "09:00", endTime: "13:00", icon: <Clapperboard size={15} /> },
  { label: "Affiche", perMonth: 1, weekdays: [4], startTime: "10:00", endTime: "12:00", icon: <ImageIcon size={15} /> },
];

function monthDays(month: string, weekdays: number[], holidays: string[] = []) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: number[] = [];
  for (let d = 1; d <= last; d++) {
    if (holidays.includes(`${month}-${String(d).padStart(2, "0")}`)) continue;
    if (weekdays.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay())) out.push(d);
  }
  return out;
}
function spread(days: number[], count: number) {
  if (!days.length) return [];
  if (count >= days.length) return Array.from({ length: count }, (_, i) => days[i % days.length]).sort((a, b) => a - b);
  return Array.from({ length: count }, (_, i) => days[Math.floor((i * days.length) / count)]);
}
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });

/** Fenêtre de création / modification d'une production récurrente. */
export function PlanForm({
  action, value, projects, types, people, nextMonth, holidays = [], closeHref, backHref, error,
}: {
  holidays?: string[];
  action: (fd: FormData) => void;
  value: PlanValue;
  projects: { id: number; title: string; client: string | null }[];
  types: { id: number; name: string }[];
  people: Person[];
  nextMonth: string;
  closeHref: string;
  backHref: string;
  error: string;
}) {
  const [projectId, setProjectId] = useState<number | null>(value.projectId);
  const [name, setName] = useState(value.name);
  const [nameTouched, setNameTouched] = useState(!!value.id);
  const [startMonth, setStartMonth] = useState(value.startMonth);
  const [endMonth, setEndMonth] = useState(value.endMonth);
  const [items, setItems] = useState<Item[]>(() => value.items.map((i, n) => ({ ...i, key: `i${n}` })));
  const [msg, setMsg] = useState(error);
  const project = projects.find((p) => p.id === projectId);
  const typeByLabel = (label: string) => types.find((t) => t.name.toLowerCase().startsWith(label.toLowerCase().slice(0, 4)))?.id ?? null;

  const set = (key: string, patch: Partial<Item>) => { setItems((all) => all.map((i) => (i.key === key ? { ...i, ...patch } : i))); setMsg(""); };
  const add = (p?: (typeof PRESETS)[number]) =>
    setItems((all) => [...all, {
      key: `n${Date.now()}`, label: p?.label ?? "", perMonth: p?.perMonth ?? 1, weekdays: p?.weekdays ?? [2],
      startTime: p?.startTime ?? "", endTime: p?.endTime ?? "", typeId: p ? typeByLabel(p.label) : null, assigneeIds: [],
    }]);
  const total = items.reduce((s, i) => s + (i.label.trim() ? i.perMonth : 0), 0);

  const payload = useMemo(() => JSON.stringify({
    id: value.id, projectId, name, startMonth, endMonth,
    items: items.map(({ key: _k, ...i }) => i),
  }), [value.id, projectId, name, startMonth, endMonth, items]);

  function check() {
    if (!projectId) return "Choisissez le projet.";
    if (!name.trim()) return "Donnez un nom à cette production.";
    if (!items.some((i) => i.label.trim())) return "Ajoutez au moins un livrable (ex. Vidéo × 4).";
    if (items.some((i) => i.label.trim() && i.weekdays.length === 0)) return "Choisissez au moins un jour pour chaque livrable.";
    if (items.some((i) => i.startTime && i.endTime && i.endTime <= i.startTime)) return "L'heure de fin doit être après l'heure de début.";
    return "";
  }

  return (
    <form action={action} onSubmit={(e) => { const m = check(); if (m) { e.preventDefault(); setMsg(m); } }}>
      <input type="hidden" name="payload" value={payload} />
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-navy-100 bg-white px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href={backHref} scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Retour aux productions"><ArrowLeft size={18} /></Link>
          <div>
            <h2 id="plan-title" className="text-lg font-bold text-navy">{value.id ? "Modifier la production" : "Nouvelle production récurrente"}</h2>
            <p className="text-sm text-navy-600/70">Les livrables sont placés chaque mois dans le planning.</p>
          </div>
        </div>
        <Link href={closeHref} scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Fermer"><X size={18} /></Link>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Projet</span>
            <select className="input" value={projectId ?? ""} onChange={(e) => {
              const id = Number(e.target.value) || null;
              setProjectId(id);
              const p = projects.find((x) => x.id === id);
              if (!nameTouched && p) setName(`Production mensuelle — ${p.client ?? p.title}`);
              setMsg("");
            }} required>
              <option value="">Choisir un projet…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}{p.client ? ` — ${p.client}` : ""}</option>)}
            </select>
            {project && <span className="mt-1 block text-xs text-navy-600/65">Client : {project.client ?? "projet interne"}</span>}
          </label>
          <label className="block"><span className="label">Nom</span>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} placeholder="ex. Contenus réseaux sociaux" required />
          </label>
          <label className="block"><span className="label">À partir de</span>
            <input type="month" className="input" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required />
          </label>
          <label className="block"><span className="label">Jusqu'à <span className="font-normal text-navy-600/60">(vide = sans fin)</span></span>
            <input type="month" className="input" value={endMonth} min={startMonth} onChange={(e) => setEndMonth(e.target.value)} />
          </label>
        </div>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-navy">Livrables par mois {total > 0 && <span className="ml-1 text-sm font-normal text-navy-600/70">· {total} au total</span>}</h3>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => <button key={p.label} type="button" onClick={() => add(p)} className="btn-ghost btn-sm">{p.icon} + {p.label}</button>)}
              <button type="button" onClick={() => add()} className="btn-ghost btn-sm"><Plus size={14} /> Autre</button>
            </div>
          </div>
          {items.length === 0 && <p className="rounded-xl border border-dashed border-navy-200 px-4 py-6 text-center text-sm text-navy-600/70">Ajoutez ce qu'il faut produire chaque mois : « + Vidéo », « + Affiche »…</p>}
          <ol className="space-y-3">
            {items.map((i, n) => {
              const preview = spread(monthDays(nextMonth, i.weekdays, holidays), i.perMonth);
              return (
                <li key={i.key} className="rounded-xl border border-navy-100">
                  <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-end">
                    <label className="block"><span className="label">Livrable {n + 1}</span>
                      <input className="input" value={i.label} onChange={(e) => set(i.key, { label: e.target.value })} placeholder="ex. Vidéo, Affiche, Reel…" />
                    </label>
                    <label className="block"><span className="label">Par mois</span>
                      <input type="number" min={1} max={31} className="input text-center font-bold" value={i.perMonth} onChange={(e) => set(i.key, { perMonth: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })} />
                    </label>
                    <button type="button" onClick={() => setItems((all) => all.filter((x) => x.key !== i.key))} className="grid h-10 w-10 place-items-center rounded-lg text-navy-600 hover:bg-red-50 hover:text-red-700" aria-label={`Retirer le livrable ${n + 1}`}><Trash2 size={16} /></button>
                  </div>
                  <div className="space-y-3 border-t border-navy-100 bg-navy-50/30 p-4">
                    <div>
                      <span className="label">Jours de production</span>
                      <div className="flex flex-wrap gap-1.5">
                        {DAYS.map((d, wd) => {
                          const on = i.weekdays.includes(wd);
                          return (
                            <button key={d} type="button" aria-pressed={on} onClick={() => set(i.key, { weekdays: on ? i.weekdays.filter((x) => x !== wd) : [...i.weekdays, wd].sort() })}
                              className={`h-9 w-12 rounded-lg border text-sm font-semibold transition ${on ? "border-navy bg-navy text-white" : "border-navy-200 bg-white text-navy-700 hover:bg-navy-50"}`}>{d}</button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block"><span className="label">Début</span><input type="time" className="input" value={i.startTime} onChange={(e) => set(i.key, { startTime: e.target.value })} /></label>
                      <label className="block"><span className="label">Fin</span><input type="time" className="input" value={i.endTime} onChange={(e) => set(i.key, { endTime: e.target.value })} /></label>
                      <label className="block"><span className="label">Type de tâche</span>
                        <select className="input" value={i.typeId ?? ""} onChange={(e) => set(i.key, { typeId: Number(e.target.value) || null })}>
                          <option value="">Aucun</option>
                          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <div>
                      <span className="label">Équipe</span>
                      <div className="flex flex-wrap gap-1.5">
                        {people.map((p) => {
                          const on = i.assigneeIds.includes(p.id);
                          return (
                            <button key={p.id} type="button" aria-pressed={on} onClick={() => set(i.key, { assigneeIds: on ? i.assigneeIds.filter((x) => x !== p.id) : [...i.assigneeIds, p.id] })}
                              className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition ${on ? "border-navy bg-navy text-white" : "border-navy-200 bg-white text-navy-700 hover:bg-navy-50"}`}>
                              <Avatar name={p.name} color={p.color} size={22} /> {p.name.split(" ")[0]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {i.label.trim() && i.weekdays.length > 0 && (
                      <p className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-navy-700 ring-1 ring-navy-100">
                        <CalendarRange size={14} className="mt-px shrink-0 text-gold-600" />
                        <span>Aperçu {monthName(nextMonth)} : <b>{i.label} × {i.perMonth}</b> → {preview.map((d) => `${SHORT[new Date(`${nextMonth}-${String(d).padStart(2, "0")}T12:00:00Z`).getUTCDay()]} ${d}`).join(", ")}
                          {i.perMonth > monthDays(nextMonth, i.weekdays, holidays).length && <b className="text-amber-700"> · plusieurs le même jour</b>}</span>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {msg && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{msg}</p>}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
        <p className="hidden text-xs text-navy-600/65 sm:block">Les jours fériés sont évités automatiquement.</p>
        <span className="flex gap-2">
          <Link href={backHref} scroll={false} className="btn-ghost">Annuler</Link>
          <Save />
        </span>
      </div>
    </form>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return <button className="btn-gold" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} Enregistrer</button>;
}
