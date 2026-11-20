/** Calculs partagés client/serveur — montants entiers en FDJ. */
export function lineTotal(qty: number, unitPrice: number, discountPct: number) {
  const pct = Math.min(Math.max(Number(discountPct) || 0, 0), 100);
  return Math.round((Number(qty) || 0) * (Number(unitPrice) || 0) * (1 - pct / 100));
}

export type Line = {
  catalogItemId: number | null;
  eventTypeId: number | null;
  designation: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPct: number;
};

export function docTotals(lines: Line[], discount: number) {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l.quantity, l.unitPrice, l.discountPct), 0);
  const d = Math.min(Math.max(Math.round(Number(discount) || 0), 0), subtotal);
  return { subtotal, discount: d, total: subtotal - d };
}
