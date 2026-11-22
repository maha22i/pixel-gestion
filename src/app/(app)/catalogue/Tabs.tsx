import Link from "next/link";
import { Layers, Sparkles } from "lucide-react";

export function CatalogTabs({ active, counts }: { active: "items" | "events"; counts?: { items?: number; events?: number } }) {
  const cls = (on: boolean) =>
    `inline-flex shrink-0 items-center gap-2 px-4 py-2 font-bold rounded-t-lg border-b-2 transition ${on ? "border-gold text-navy" : "border-transparent text-navy-600/60 hover:text-navy"}`;
  const count = (n: number | undefined, on: boolean) =>
    n === undefined ? null : (
      <span className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${on ? "bg-gold-100 text-amber-900" : "bg-navy-50 text-navy-600/70"}`}>{n}</span>
    );
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-navy-100" aria-label="Sections du catalogue">
      <Link href="/catalogue" className={cls(active === "items")} aria-current={active === "items" ? "page" : undefined}>
        <Layers size={16} aria-hidden /> Services & produits {count(counts?.items, active === "items")}
      </Link>
      <Link href="/catalogue/evenements" className={cls(active === "events")} aria-current={active === "events" ? "page" : undefined}>
        <Sparkles size={16} aria-hidden /> Types d'événement <span className="hidden font-normal text-navy-600/60 sm:inline">(mariage)</span> {count(counts?.events, active === "events")}
      </Link>
    </nav>
  );
}
