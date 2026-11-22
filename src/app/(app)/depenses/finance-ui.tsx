import Link from "next/link";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, X } from "lucide-react";
import { fdj, today } from "@/lib/format";
import { MonthSelect } from "./MonthSelect";

/* Briques partagées par /depenses et /paiements : période, comparaison, répartition. */

export type Query = Record<string, string | number | null | undefined>;

/** Construit une URL en ignorant les paramètres vides. */
export function href(path: string, params: Query) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export function currentMonth() {
  return today().slice(0, 7);
}

/** Valeur de période sûre : "YYYY-MM" ou "tout". */
export function parseMonth(m: string | undefined) {
  if (m === "tout") return "tout";
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : currentMonth();
}

export function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(m: string) {
  if (m === "tout") return "toute la période";
  return new Date(m + "-01T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function monthName(m: string) {
  return new Date(m + "-01T00:00:00").toLocaleDateString("fr-FR", { month: "long" });
}

/** « en novembre 2026 » / « sur toute la période ». */
export function inMonth(m: string) {
  return m === "tout" ? "sur toute la période" : `en ${monthLabel(m)}`;
}

/** Navigation de période : mois précédent / liste / mois suivant / retour au mois courant. */
export function MonthNav({ path, month, keep }: { path: string; month: string; keep: Query }) {
  const cur = currentMonth();
  const list: string[] = [];
  for (let i = 0; i < 24; i++) list.push(shiftMonth(cur, -i));
  if (month !== "tout" && !list.includes(month)) {
    list.push(month);
    list.sort().reverse();
  }
  const options = [
    ...list.map((m) => ({ value: m, label: monthLabel(m), href: href(path, { ...keep, m }) })),
    { value: "tout", label: "Toute la période", href: href(path, { ...keep, m: "tout" }) },
  ];
  const all = month === "tout";
  const prev = all ? null : href(path, { ...keep, m: shiftMonth(month, -1) });
  const next = all || month >= cur ? null : href(path, { ...keep, m: shiftMonth(month, 1) });
  const arrow = "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-navy-700 transition";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="card flex items-center gap-0.5 p-1">
        {prev ? (
          <Link href={prev} scroll={false} className={`${arrow} hover:bg-navy-50`} aria-label="Mois précédent" title="Mois précédent"><ChevronLeft size={18} /></Link>
        ) : <span className={`${arrow} opacity-30`} aria-hidden><ChevronLeft size={18} /></span>}
        <MonthSelect value={month} options={options} label="Période" />
        {next ? (
          <Link href={next} scroll={false} className={`${arrow} hover:bg-navy-50`} aria-label="Mois suivant" title="Mois suivant"><ChevronRight size={18} /></Link>
        ) : <span className={`${arrow} opacity-30`} aria-hidden><ChevronRight size={18} /></span>}
      </div>
      {month !== cur && (
        <Link href={href(path, { ...keep, m: cur })} scroll={false} className="text-sm font-bold text-navy-600/80 underline-offset-2 hover:text-gold-600 hover:underline">
          Revenir à {monthName(cur)}
        </Link>
      )}
    </div>
  );
}

/** Évolution par rapport au mois précédent. `upIsGood` : une hausse est-elle une bonne nouvelle ? */
export function Delta({ cur, prev, prevMonth, upIsGood }: { cur: number; prev: number; prevMonth: string; upIsGood: boolean }) {
  const name = monthName(prevMonth);
  if (prev === 0 && cur === 0) return <span>Rien non plus en {name}</span>;
  if (prev === 0) return <span>Aucun montant en {name}</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <span>Stable par rapport à {name}</span>;
  const up = pct > 0;
  const good = up === upIsGood;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
        <Icon size={13} aria-hidden />
        {pct >= 200 ? `×${Math.round((cur / prev) * 10) / 10}`.replace(".", ",") : `${up ? "+" : "−"}${Math.abs(pct)} %`}
      </span>
      <span>vs {name} ({fdj(prev)})</span>
    </span>
  );
}

export type Slice = { key: string; label: string; amount: number; count: number; color: string; href: string };

/** Répartition compacte : une barre empilée + une légende cliquable qui sert de filtre. */
export function Breakdown({
  title, slices, active, resetHref, empty, unit,
}: { title: string; slices: Slice[]; active?: string; resetHref: string; empty: string; unit: [string, string] }) {
  const total = slices.reduce((s, x) => s + x.amount, 0);
  const shown = slices.filter((s) => s.amount > 0 || s.key === active);
  return (
    <section className="card card-pad min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-section">{title}</h2>
        {active ? (
          <Link href={resetHref} scroll={false} className="inline-flex items-center gap-1 text-sm font-bold text-navy-600/80 hover:text-gold-600">
            <X size={14} aria-hidden /> Tout afficher
          </Link>
        ) : shown.length > 1 ? <span className="text-xs text-navy-600/60">Cliquez pour filtrer</span> : null}
      </div>
      {total === 0 && !active ? <p className="text-sm text-navy-600/65">{empty}</p> : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-navy-50" aria-hidden>
            {shown.map((s) => (
              <span
                key={s.key}
                className={`${s.color} h-full border-r-2 border-white transition-opacity last:border-r-0 ${active && active !== s.key ? "opacity-25" : ""}`}
                style={{ width: `${total ? (s.amount / total) * 100 : 0}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {shown.map((s) => {
              const on = active === s.key;
              const pct = total ? Math.round((s.amount / total) * 100) : 0;
              return (
                <li key={s.key}>
                  <Link
                    href={on ? resetHref : s.href}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    title={`${s.count} ${s.count > 1 ? unit[1] : unit[0]}`}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition ${
                      on ? "border-navy bg-navy text-white" : `border-navy-100 bg-white text-navy-800 hover:border-navy-200 hover:bg-navy-50 ${active ? "opacity-60 hover:opacity-100" : ""}`
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.color} ${on ? "ring-2 ring-white/80" : ""}`} aria-hidden />
                    <span className="font-bold">{s.label}</span>
                    <span className="tabular-nums">{fdj(s.amount)}</span>
                    <span className={`tabular-nums text-xs ${on ? "text-white/70" : "text-navy-600/60"}`}>{pct} %</span>
                    {on && <X size={13} aria-label="Retirer le filtre" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
