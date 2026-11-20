export type InstallmentState = "payee" | "partielle" | "retard" | "a_venir";

/** Répartit les paiements reçus sur les échéances dans l'ordre (allocation FIFO). */
export function allocate<T extends { amount: number; dueDate: string | null }>(installments: T[], paid: number, todayIso: string) {
  let left = paid;
  return installments.map((i) => {
    const covered = Math.min(left, i.amount);
    left -= covered;
    const remaining = i.amount - covered;
    const state: InstallmentState =
      remaining === 0 ? "payee"
      : i.dueDate && i.dueDate < todayIso ? "retard"
      : covered > 0 ? "partielle"
      : "a_venir";
    return { ...i, covered, remaining, state };
  });
}

export const INSTALLMENT_STATE: Record<InstallmentState, [string, string]> = {
  payee: ["Payée", "badge-green"],
  partielle: ["Partielle", "badge-gold"],
  retard: ["En retard", "badge-red"],
  a_venir: ["À venir", "badge-gray"],
};
