"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowRight, Check, CalendarRange, FolderKanban, ListChecks, LoaderCircle, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui";

type Option = { id: number; name: string };
type Project = { id: number; title: string; client: string | null };
type Person = { id: number; name: string; color: string; jobTitle: string | null };

export type WizardTask = {
  title: string;
  description: string;
  typeId: number | null;
  priority: string;
  projectId: number | null;
  externalUrl: string;
  startDate: string;
  startTime: string;
  dueDate: string;
  dueTime: string;
  assignees: number[];
  /** Sous-tâches : `id` 0 pour une nouvelle. */
  subtasks: { id: number; label: string; done: boolean }[];
};

const STEPS = [
  { key: "essentiel", label: "L'essentiel", icon: Pencil },
  { key: "projet", label: "Projet", icon: FolderKanban },
  { key: "planning", label: "Planning", icon: CalendarRange },
  { key: "equipe", label: "Équipe", icon: Users },
  { key: "soustaches", label: "Sous-tâches", icon: ListChecks },
  { key: "recap", label: "Vérification", icon: Check },
] as const;

const fr = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" }) : "");

/** Modification d'une tâche en étapes (Précédent / Suivant), dans une fenêtre modale. */
export function TaskWizard({
  action, task, projects, types, people, priorities, back, closeHref, mode = "edit", canAssign = true, me, initialStep,
}: {
  /** Ouvre directement une étape (ex. « soustaches »). */
  initialStep?: string;
  mode?: "create" | "edit";
  /** Faux : la tâche est attribuée automatiquement à l'utilisateur connecté. */
  canAssign?: boolean;
  me?: Person;
  action: (fd: FormData) => void;
  task: WizardTask;
  projects: Project[];
  types: Option[];
  people: Person[];
  priorities: Record<string, string>;
  back: string;
  closeHref: string;
}) {
  const startAt = Math.max(0, STEPS.findIndex((x) => x.key === initialStep));
  const [step, setStep] = useState(startAt);
  const [reached, setReached] = useState(mode === "edit" ? STEPS.length - 1 : startAt);
  const [draft, setDraft] = useState("");
  // Clé locale stable pour chaque ligne (les nouvelles n'ont pas encore d'id).
  const [rows, setRows] = useState(() => task.subtasks.map((t, i) => ({ ...t, key: `s${i}` })));
  const addRow = () => {
    const label = draft.replace(/\s+/g, " ").trim();
    if (!label) return;
    setRows((r) => [...r, { id: 0, label, done: false, key: `n${Date.now()}` }]);
    setDraft("");
  };
  const moveRow = (i: number, d: -1 | 1) => setRows((r) => {
    const j = i + d;
    if (j < 0 || j >= r.length) return r;
    const n = [...r];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const [error, setError] = useState("");
  const [v, setV] = useState(task);
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof WizardTask>(k: K, value: WizardTask[K]) => { setV((cur) => ({ ...cur, [k]: value })); setError(""); };
  const project = useMemo(() => projects.find((p) => p.id === v.projectId) ?? null, [projects, v.projectId]);
  const last = STEPS.length - 1;

  function check(i: number) {
    if (i === 0 && !v.title.trim()) return "Le titre est obligatoire.";
    if (i === 2) {
      if (v.startDate && v.dueDate && v.dueDate < v.startDate) return "La date de fin doit être après la date de début.";
      if (v.startDate && v.startDate === v.dueDate && v.startTime && v.dueTime && v.dueTime <= v.startTime) return "L'heure de fin doit être après l'heure de début.";
      if ((v.startTime && !v.startDate) || (v.dueTime && !v.dueDate)) return "Indiquez la date correspondant à chaque heure.";
    }
    if (i === 3 && canAssign && v.assignees.length === 0) return "Choisissez au moins une personne.";
    return "";
  }
  function go(i: number) {
    if (i > step) {
      for (let k = step; k < i; k++) { const e = check(k); if (e) { setStep(k); setError(e); return; } }
    }
    setError("");
    setStep(i);
    setReached((r) => Math.max(r, i));
  }

  const field = "input";
  const pill = (active: boolean) =>
    `inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${active ? "border-navy bg-navy text-white" : "border-navy-200 bg-white text-navy-700 hover:bg-navy-50"}`;

  return (
    <form
      ref={formRef}
      action={action}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.target instanceof HTMLTextAreaElement) return;
        if (e.target instanceof HTMLInputElement && e.target.dataset.subtask) { e.preventDefault(); if (e.target.dataset.subtask === "new") addRow(); return; }
        if (step < last) { e.preventDefault(); go(step + 1); }
      }}
      onSubmit={(e) => { for (let k = 0; k < last; k++) { const err = check(k); if (err) { e.preventDefault(); setStep(k); setError(err); return; } } }}
    >
      <input type="hidden" name="back" value={back} />

      {/* En-tête + étapes */}
      <div className="sticky top-0 z-10 border-b border-navy-100 bg-white">
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4 sm:px-6">
          <h2 id="task-edit-title" className="text-lg font-bold text-navy">{mode === "create" ? "Nouvelle tâche" : "Modifier la tâche"}</h2>
          <Link href={closeHref} scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 transition hover:bg-navy-50 hover:text-navy" aria-label="Fermer" title="Fermer"><X size={18} /></Link>
        </div>
        <ol className="flex gap-1 overflow-x-auto px-4 pb-3 sm:px-5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const state = i === step ? "current" : i <= reached ? "done" : "todo";
            return (
              <li key={s.key} className="flex-1">
                <button
                  type="button"
                  disabled={i > reached + 1}
                  onClick={() => go(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={`flex w-full min-w-[92px] flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${state === "current" ? "text-navy" : "text-navy-600/70 hover:text-navy"}`}
                >
                  <span className={`grid h-8 w-8 place-items-center rounded-full ${state === "current" ? "bg-navy text-white" : state === "done" ? "bg-gold text-navy-900" : "bg-navy-50 text-navy-600/60"}`}>
                    {state === "done" && i !== step ? <Check size={15} /> : <Icon size={15} />}
                  </span>
                  <span className="whitespace-nowrap">{i + 1}. {s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="h-1 bg-navy-50"><div className="h-full bg-gold transition-all" style={{ width: `${(step / last) * 100}%` }} /></div>
      </div>

      <div className="min-h-[300px] p-5 sm:p-6">
        {/* 1. L'essentiel */}
        <div hidden={step !== 0} className="space-y-4">
          <label className="block"><span className="label">Titre de la tâche</span>
            <input name="title" className={field} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="ex. Monter le teaser" autoFocus required />
          </label>
          <label className="block"><span className="label">Description <span className="font-normal text-navy-600/60">(facultatif)</span></span>
            <textarea name="description" className={field} rows={4} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="Consignes, détails, liens utiles…" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="label">Type</span>
              <select name="typeId" className={field} value={v.typeId ?? ""} onChange={(e) => set("typeId", Number(e.target.value) || null)}>
                <option value="">Aucun type</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <fieldset>
              <legend className="label">Priorité</legend>
              <input type="hidden" name="priority" value={v.priority} />
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(priorities).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => set("priority", k)} className={pill(v.priority === k)} aria-pressed={v.priority === k}>{label}</button>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        {/* 2. Projet */}
        <div hidden={step !== 1} className="space-y-4">
          <label className="block"><span className="label">Projet</span>
            <select name="projectId" className={field} value={v.projectId ?? ""} onChange={(e) => set("projectId", Number(e.target.value) || null)}>
              <option value="">Sans projet</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <div className="rounded-lg bg-navy-50/70 px-4 py-3 text-sm">
            <span className="text-navy-600/75">Client : </span>
            <b className="text-navy">{project ? project.client ?? "projet interne (sans client)" : "aucun"}</b>
            <p className="mt-0.5 text-xs text-navy-600/65">Le client est repris automatiquement du projet.</p>
          </div>
          <label className="block"><span className="label">Lien externe <span className="font-normal text-navy-600/60">(facultatif)</span></span>
            <input name="externalUrl" className={field} value={v.externalUrl} onChange={(e) => set("externalUrl", e.target.value)} placeholder="https://…" inputMode="url" />
          </label>
        </div>

        {/* 3. Planning */}
        <div hidden={step !== 2} className="space-y-5">
          <div className="grid gap-4 rounded-xl border border-navy-100 p-4 sm:grid-cols-2">
            <p className="text-sm font-bold text-navy sm:col-span-2">Début</p>
            <label className="block"><span className="label">Date de début</span>
              <input type="date" name="startDate" className={field} value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </label>
            <label className="block"><span className="label">Heure de début</span>
              <input type="time" name="startTime" className={field} value={v.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </label>
          </div>
          <div className="grid gap-4 rounded-xl border border-navy-100 p-4 sm:grid-cols-2">
            <p className="text-sm font-bold text-navy sm:col-span-2">Fin</p>
            <label className="block"><span className="label">Date de fin</span>
              <input type="date" name="dueDate" className={field} value={v.dueDate} min={v.startDate || undefined} onChange={(e) => set("dueDate", e.target.value)} />
            </label>
            <label className="block"><span className="label">Heure de fin</span>
              <input type="time" name="dueTime" className={field} value={v.dueTime} onChange={(e) => set("dueTime", e.target.value)} />
            </label>
          </div>
          {v.startDate && !v.dueDate && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => set("dueDate", v.startDate)}>Même jour que le début</button>
          )}
        </div>

        {/* 4. Équipe */}
        <div hidden={step !== 3}>
          {!canAssign && me ? (
            <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
              <Avatar name={me.name} color={me.color} size={34} />
              <p className="text-sm text-navy-700">Cette tâche vous sera attribuée, <b className="text-navy">{me.name}</b>.</p>
            </div>
          ) : (<>
          <p className="label">Personnes assignées</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {people.map((p) => {
              const on = v.assignees.includes(p.id);
              return (
                <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${on ? "border-navy bg-navy-50/70" : "border-navy-100 hover:bg-navy-50/50"}`}>
                  <input type="checkbox" name="assignees" value={p.id} checked={on} onChange={() => set("assignees", on ? v.assignees.filter((x) => x !== p.id) : [...v.assignees, p.id])} className="h-4 w-4 accent-[#2C3E50]" />
                  <Avatar name={p.name} color={p.color} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-navy">{p.name}</span>
                    <span className="block truncate text-xs text-navy-600/65">{p.jobTitle || "—"}</span>
                  </span>
                </label>
              );
            })}
          </div>
          </>)}
        </div>

        {/* 5. Sous-tâches */}
        <div hidden={step !== 4}>
          <input type="hidden" name="checks_sent" value="1" />
          <p className="mb-3 text-sm text-navy-600/80">Découpez la tâche en petites étapes à cocher. Facultatif.</p>
          {rows.length > 0 && (
            <ol className="mb-3 space-y-1.5">
              {rows.map((r, i) => (
                <li key={r.key} className="flex items-center gap-2 rounded-lg border border-navy-100 bg-white px-2 py-1.5">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${r.done ? "bg-emerald-500 text-white" : "bg-navy-50 text-navy-600"}`} title={r.done ? "Déjà cochée" : undefined}>{r.done ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                  <input type="hidden" name="check_id" value={r.id} />
                  <input
                    name="check_label"
                    data-subtask="row"
                    value={r.label}
                    onChange={(e) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))}
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-navy outline-none hover:border-navy-100 focus:border-gold-600"
                    aria-label={`Sous-tâche ${i + 1}`}
                  />
                  <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0} className="grid h-7 w-7 place-items-center rounded-md text-navy-600 hover:bg-navy-50 disabled:opacity-30" aria-label="Monter"><ArrowDown size={14} className="rotate-180" /></button>
                  <button type="button" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1} className="grid h-7 w-7 place-items-center rounded-md text-navy-600 hover:bg-navy-50 disabled:opacity-30" aria-label="Descendre"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))} className="grid h-7 w-7 place-items-center rounded-md text-navy-600 hover:bg-red-50 hover:text-red-700" aria-label={`Retirer « ${r.label} »`}><Trash2 size={14} /></button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex gap-2">
            <input
              data-subtask="new"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="input"
              placeholder={rows.length ? "Ajouter une autre sous-tâche" : "ex. Préparer le matériel"}
              aria-label="Nouvelle sous-tâche"
            />
            <button type="button" onClick={addRow} disabled={!draft.trim()} className="btn-ghost shrink-0"><Plus size={16} /> Ajouter</button>
          </div>
          {rows.length === 0 && <p className="mt-3 text-xs text-navy-600/60">Aucune sous-tâche pour l'instant. Tapez puis Entrée pour en ajouter.</p>}
        </div>

        {/* 6. Vérification */}
        <div hidden={step !== 5}>
          <p className="mb-3 text-sm text-navy-600/80">Vérifiez avant d'enregistrer. Cliquez sur une étape pour corriger.</p>
          <dl className="divide-y divide-navy-100 rounded-xl border border-navy-100">
            {[
              ["Titre", v.title || "—", 0],
              ["Type & priorité", `${types.find((t) => t.id === v.typeId)?.name ?? "Aucun type"} · ${priorities[v.priority] ?? v.priority}`, 0],
              ["Projet", project ? `${project.title}${project.client ? ` — ${project.client}` : ""}` : "Sans projet", 1],
              ["Début", v.startDate ? `${fr(v.startDate)}${v.startTime ? ` à ${v.startTime}` : ""}` : "Non défini", 2],
              ["Fin", v.dueDate ? `${fr(v.dueDate)}${v.dueTime ? ` à ${v.dueTime}` : ""}` : "Non définie", 2],
              ["Équipe", canAssign ? v.assignees.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean).join(", ") || "—" : me?.name ?? "Vous", 3],
              ["Sous-tâches", rows.filter((r) => r.label.trim()).length ? rows.filter((r) => r.label.trim()).map((r) => r.label.trim()).join(" · ") : "Aucune", 4],
            ].map(([label, value, target]) => (
              <div key={String(label)} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="w-32 shrink-0 text-navy-600/75">{label}</dt>
                <dd className="min-w-0 flex-1 font-semibold text-navy first-letter:uppercase">{value}</dd>
                <button type="button" onClick={() => go(Number(target))} className="shrink-0 text-xs font-bold text-navy-600 hover:text-gold-600">Modifier</button>
              </div>
            ))}
          </dl>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
        {step > 0
          ? <button type="button" className="btn-ghost" onClick={() => go(step - 1)}><ArrowLeft size={16} /> Précédent</button>
          : <Link href={closeHref} scroll={false} className="btn-ghost">Annuler</Link>}
        <span className="hidden text-xs font-semibold text-navy-600/60 sm:block">Étape {step + 1} sur {STEPS.length}</span>
        {step < last
          ? <button type="button" className="btn-primary" onClick={() => go(step + 1)}>Suivant <ArrowRight size={16} /></button>
          : <SaveButton label={mode === "create" ? "Créer la tâche" : "Enregistrer"} />}
      </div>
    </form>
  );
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-gold" disabled={pending}>
      {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} {label}
    </button>
  );
}
