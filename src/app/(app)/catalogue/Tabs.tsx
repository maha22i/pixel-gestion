import Link from "next/link";

export function CatalogTabs({ active }: { active: "items" | "events" }) {
  const cls = (on: boolean) =>
    `px-4 py-2 font-bold rounded-t-lg border-b-2 ${on ? "border-gold text-navy" : "border-transparent text-navy-600/60 hover:text-navy"}`;
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-navy-100">
      <Link href="/catalogue" className={`${cls(active === "items")} shrink-0`}>Services & produits</Link>
      <Link href="/catalogue/evenements" className={`${cls(active === "events")} shrink-0`}>Types d'événement (mariage)</Link>
    </div>
  );
}
