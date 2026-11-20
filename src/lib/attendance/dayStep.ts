export type DayStep = "arrivee" | "depart" | "fini";

export function dayStep(punches: { kind: string; status: string }[]): DayStep {
  const kept = punches.filter((p) => p.status !== "refuse");
  const arrived = kept.some((p) => p.kind === "arrivee");
  const left = kept.some((p) => p.kind === "depart");
  if (!arrived) return "arrivee";
  if (!left) return "depart";
  return "fini";
}
