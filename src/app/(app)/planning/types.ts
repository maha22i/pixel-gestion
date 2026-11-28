export type PlanDay = { iso: string; label: string; weekday: string; dayNum: number; rest: boolean };
export type PlanPerson = { id: number; name: string; color: string; jobTitle: string | null };
export type PlanAssignee = { id: number; name: string; color: string };
export type PlanTask = {
  id: number;
  title: string;
  due: string | null;
  time: string | null;
  status: string;
  priority: string;
  projectId: number | null;
  projectTitle: string | null;
  assignees: PlanAssignee[];
  late: boolean;
  /** Livrable d'une production récurrente. */
  recurring?: boolean;
};
export type PlanAbsence = { userId: number; start: string; end: string; label: string };

/** Enregistre un déplacement (date, heure, personne) via la route existante. */
export async function moveTaskRequest(input: { id: number; due?: string; time?: string; userId?: number; unset?: boolean; back: string }) {
  const fd = new FormData();
  fd.set("id", String(input.id));
  if (input.unset) fd.set("unset", "1");
  if (input.due) fd.set("dueDate", input.due);
  if (input.time) fd.set("dueTime", input.time);
  if (input.userId) fd.set("userId", String(input.userId));
  fd.set("ajax", "1");
  fd.set("back", input.back);
  const res = await fetch("/planning/deplacer", { method: "POST", body: fd });
  return res.ok;
}

export const STATUS_CHIP: Record<string, string> = {
  a_faire: "",
  en_cours: "ring-1 ring-sky-300",
  en_revue: "ring-1 ring-amber-300",
  bloque: "ring-1 ring-red-300",
  termine: "opacity-55 line-through",
};

/** Début de glissement d'une tâche : déplacement explicite (évite le glissement natif des liens). */
export function startDrag(e: React.DragEvent, id: number) {
  e.dataTransfer.setData("id", String(id));
  e.dataTransfer.effectAllowed = "move";
}
/** Survol d'une zone de dépôt. */
export function allowDrop(e: React.DragEvent) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}
