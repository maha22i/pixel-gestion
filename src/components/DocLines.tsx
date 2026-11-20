import { fdj, num } from "@/lib/format";

type L = {
  id: number; eventTypeId: number | null; designation: string; description: string | null;
  quantity: string; unit: string | null; unitPrice: number; discountPct: number; total: number;
};

/** Regroupe les lignes par type d'événement (ordre d'apparition), lignes sans événement en premier. */
export function groupLines<T extends { eventTypeId: number | null }>(lines: T[]) {
  const groups: { eventTypeId: number | null; lines: T[] }[] = [];
  for (const l of lines) {
    let g = groups.find((x) => x.eventTypeId === l.eventTypeId);
    if (!g) groups.push((g = { eventTypeId: l.eventTypeId, lines: [] }));
    g.lines.push(l);
  }
  return groups.sort((a, b) => (a.eventTypeId == null ? -1 : b.eventTypeId == null ? 1 : 0));
}

export function DocLines({
  lines, events, subtotal, discount, total, extra,
}: {
  lines: L[]; events: Record<number, string>; subtotal: number; discount: number; total: number; extra?: React.ReactNode;
}) {
  const groups = groupLines(lines);
  const hasEvents = groups.some((g) => g.eventTypeId != null);
  return (
    <div className="card overflow-x-auto">
      <table className="table min-w-0 md:min-w-[640px]">
        <thead>
          <tr><th>Désignation</th><th className="num">Qté</th><th className="num">P.U.</th><th className="num">Remise</th><th className="num">Total</th></tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Group key={String(g.eventTypeId)} title={hasEvents ? (g.eventTypeId ? events[g.eventTypeId] ?? "Événement" : "Prestations générales") : null} lines={g.lines} />
          ))}
        </tbody>
      </table>
      <div className="border-t border-navy-100 px-4 py-4 flex justify-end">
        <div className="w-full max-w-xs space-y-1.5">
          <div className="flex justify-between"><span>Sous-total</span><span className="tabular-nums">{fdj(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between text-navy-600"><span>Remise</span><span className="tabular-nums">− {fdj(discount)}</span></div>}
          <div className="flex justify-between rounded-lg bg-navy text-white px-3 py-2 font-bold"><span>TOTAL</span><span className="tabular-nums text-gold">{fdj(total)}</span></div>
          {extra}
        </div>
      </div>
    </div>
  );
}

function Group({ title, lines }: { title: string | null; lines: L[] }) {
  return (
    <>
      {title && (
        <tr className="hover:bg-transparent">
          <td colSpan={5} className="bg-gold-50 border-l-4 border-gold font-bold text-navy py-2">{title}</td>
        </tr>
      )}
      {lines.map((l) => (
        <tr key={l.id}>
          <td>
            <span className="font-bold">{l.designation}</span>
            {l.description && <div className="text-sm text-navy-600/80 whitespace-pre-line">{l.description}</div>}
          </td>
          <td className="num">{num(l.quantity)} {l.unit}</td>
          <td className="num">{fdj(l.unitPrice)}</td>
          <td className="num">{l.discountPct ? `${l.discountPct} %` : "—"}</td>
          <td className="num font-bold">{fdj(l.total)}</td>
        </tr>
      ))}
    </>
  );
}
