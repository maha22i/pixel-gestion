"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary shrink-0" disabled={disabled || pending}>
      <Plus size={16} aria-hidden /> {pending ? "Ajout…" : "Ajouter"}
    </button>
  );
}

/**
 * Ajout rapide d'une tâche (titre, personne, échéance) : compose la ligne
 * « titre | id personne | date » attendue par l'action existante quickTasks.
 */
export function QuickTask({
  action, projectId, people, defaultPerson,
}: {
  action: (fd: FormData) => void;
  projectId: number;
  people: { id: number; name: string }[];
  defaultPerson?: number | null;
}) {
  const [title, setTitle] = useState("");
  const [who, setWho] = useState(defaultPerson ? String(defaultPerson) : "");
  const [due, setDue] = useState("");
  const clean = title.replace(/\|/g, "/").trim();
  return (
    <form action={action} className="flex flex-wrap gap-2" onSubmit={() => window.setTimeout(() => setTitle(""), 0)}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="lines" value={clean ? [clean, who, due].join(" | ") : ""} />
      <input className="input min-w-0 flex-[1_1_16rem]" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle tâche…" aria-label="Titre de la tâche" required />
      <select className="input w-auto min-w-0 flex-[1_1_9rem]" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assigner à">
        <option value="">Moi</option>
        {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <input type="date" className="input w-auto min-w-0 flex-[1_1_9rem]" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Échéance" />
      <Submit disabled={!clean} />
    </form>
  );
}
