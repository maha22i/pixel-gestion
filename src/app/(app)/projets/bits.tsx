import { Flag } from "lucide-react";
import { dateFr } from "@/lib/format";
import { Progress } from "@/components/ui";

/** Statuts pour lesquels un projet n'est plus « à livrer » (pas de retard possible). */
export const CLOSED = ["livre", "publie", "cloture", "annule"];

export function isLate(status: string, endIso: string | null | undefined, day: string) {
  return !!endIso && endIso < day && !CLOSED.includes(status);
}

/** Nombre de jours entiers entre deux dates ISO (b − a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

/** Échéance : date + « dans 5 j », « aujourd'hui » ou « en retard de 8 j ». */
export function Due({ endIso, status, day, compact = false }: { endIso: string | null; status: string; day: string; compact?: boolean }) {
  if (!endIso) return <span className="text-navy-600/50">Pas d'échéance</span>;
  const open = !CLOSED.includes(status);
  const diff = daysBetween(day, endIso);
  let hint: React.ReactNode = null;
  if (open) {
    if (diff < 0) hint = <span className="font-bold text-red-700">En retard de {plural(-diff, "jour")}</span>;
    else if (diff === 0) hint = <span className="font-bold text-amber-700">Aujourd'hui</span>;
    else if (diff <= 14) hint = <span className="font-bold text-amber-700">Dans {plural(diff, "jour")}</span>;
    else hint = <span className="text-navy-600/65">Dans {plural(diff, "jour")}</span>;
  }
  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5 text-sm">
        <span className={diff < 0 && open ? "font-bold text-red-700" : "text-navy-700"}>{dateFr(endIso)}</span>
        {hint && <span className="text-xs">{hint}</span>}
      </span>
    );
  }
  return (
    <span className="block whitespace-nowrap">
      <span className={diff < 0 && open ? "font-bold text-red-700" : ""}>{dateFr(endIso)}</span>
      {hint && <span className="block text-xs">{hint}</span>}
    </span>
  );
}

/** Avancement réel : tâches terminées / total (hors annulées). */
export function TaskProgress({ done, total, late = 0, className = "" }: { done: number; total: number; late?: number; className?: string }) {
  if (!total) return <span className={`text-sm text-navy-600/50 ${className}`}>Aucune tâche</span>;
  const pct = Math.round((done / total) * 100);
  return (
    <div className={`min-w-[7.5rem] ${className}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-bold tabular-nums text-navy">{pct} %</span>
        <span className="tabular-nums text-navy-600/70">{done}/{total} tâche{total > 1 ? "s" : ""}</span>
      </div>
      <Progress value={pct} tone={pct === 100 ? "green" : late > 0 ? "red" : "gold"} />
      {late > 0 && <span className="mt-1 block text-xs font-bold text-red-700">{plural(late, "tâche")} en retard</span>}
    </div>
  );
}

export const PRIORITY_CLS: Record<string, string> = { haute: "text-amber-700", urgente: "text-red-700" };

export function PriorityFlag({ priority }: { priority: string | null | undefined }) {
  if (priority !== "haute" && priority !== "urgente") return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${PRIORITY_CLS[priority]}`} title={`Priorité ${priority}`}>
      <Flag size={12} aria-hidden /> {priority === "urgente" ? "Urgent" : "Prioritaire"}
    </span>
  );
}
