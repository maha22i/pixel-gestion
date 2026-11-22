"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, FolderKanban, Package, FileText, Receipt, ScrollText, Wallet, TrendingDown,
  ShieldCheck, Settings, LogOut, Menu, X, UserCircle, CheckSquare, CalendarDays, BarChart3, Sun, Camera, ClipboardCheck,
  QrCode, CalendarCheck,
} from "lucide-react";

type Group = "moi" | "pilotage" | "activite" | "finance";
type Item = { href: string; label: string; icon: keyof typeof ICONS; group?: Group };
const GROUPS: { key: Group; label: string }[] = [
  { key: "moi", label: "Mon espace" },
  { key: "pilotage", label: "Pilotage" },
  { key: "activite", label: "Activité" },
  { key: "finance", label: "Ventes & finance" },
];
const ICONS = {
  dashboard: LayoutDashboard, clients: Users, projets: FolderKanban, catalogue: Package,
  devis: FileText, factures: Receipt, contrats: ScrollText, paiements: Wallet, depenses: TrendingDown,
  users: ShieldCheck, settings: Settings, profile: UserCircle,
  taches: CheckSquare, planning: CalendarDays, suivi: BarChart3, journee: Sun, materiel: Camera,
  verification: ClipboardCheck, pointer: QrCode, presences: CalendarCheck,
};

export function Sidebar({
  items, adminItems, userName, roleLabel, logout, bell,
}: {
  items: Item[]; adminItems: Item[]; userName: string; roleLabel: string; logout: () => void; bell?: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  useEffect(() => { setOpen(false); }, [path]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nav = (list: Item[]) =>
    list.map((it) => {
      const Icon = ICONS[it.icon];
      const active = isActive(it.href);
      return (
        <Link
          key={it.href}
          href={it.href}
          onClick={() => setOpen(false)}
          aria-current={active ? "page" : undefined}
          className={`group relative flex items-center gap-3 rounded-lg px-3 py-[6px] text-[14px] font-semibold transition-colors ${
            active
              ? "bg-white/[0.12] text-white"
              : "text-white/65 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          {active && <span aria-hidden className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-gold" />}
          <Icon size={17} className={active ? "text-gold" : "text-white/55 group-hover:text-white"} />
          {it.label}
        </Link>
      );
    });

  const heading = (label: string, first = false) => (
    <p className={`px-3 pb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 ${first ? "pt-0" : "pt-3"}`}>{label}</p>
  );

  const grouped = GROUPS.map((g) => ({ ...g, list: items.filter((it) => (it.group ?? "pilotage") === g.key) })).filter((g) => g.list.length);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-navy px-3 pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2">
          <img src="/logo-light.png" alt="Pixel Nomade" className="h-9 w-auto max-w-[42vw] object-contain object-left" />
          <div className="flex items-center gap-0.5">
            <div className="text-white [&_summary]:text-white [&_summary]:hover:bg-white/10">{bell}</div>
            <details className="relative">
              <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full [&::-webkit-details-marker]:hidden" aria-label="Compte">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gold text-sm font-bold text-navy-900">
                  {userName.charAt(0).toUpperCase()}
                </span>
              </summary>
              <div className="absolute right-0 z-50 mt-1 w-56 max-w-[calc(100vw-1.5rem)] rounded-xl border border-gold/30 bg-white p-2 text-navy shadow-xl">
                <p className="px-3 py-1.5 text-sm font-bold">{userName}</p>
                <p className="px-3 pb-2 text-[12px] text-navy-600/70">{roleLabel}</p>
                <Link href="/profil" className="block rounded-lg px-3 py-2 text-sm font-bold hover:bg-gold/15" onClick={() => setOpen(false)}>Mon profil</Link>
                <form action={logout}>
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold hover:bg-gold/15">
                    <LogOut size={16} /> Déconnexion
                  </button>
                </form>
              </div>
            </details>
            <button
              onClick={() => setOpen(!open)}
              className="grid h-11 w-11 place-items-center rounded-xl text-white transition hover:bg-white/10"
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={open}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <aside
        data-open={open ? "true" : "false"}
        className={`fixed bottom-0 left-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-40 flex w-[min(19.5rem,88vw)] shrink-0 flex-col border-r border-white/10 bg-navy shadow-2xl transition-transform duration-200 lg:sticky lg:bottom-auto lg:top-0 lg:z-20 lg:h-screen lg:w-64 lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full max-lg:invisible"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(245,166,35,0.16),transparent_40%),linear-gradient(180deg,#2C3E50_0%,#22303E_100%)]" />
        <div className="relative hidden px-5 pb-3 pt-4 lg:block">
          <Link href="/" aria-label="Accueil">
            <img src="/logo-light.png" alt="Pixel Nomade" className="h-11 w-auto object-contain object-left" />
          </Link>
        </div>
        <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 pt-4 [scrollbar-width:thin] lg:pt-1">
          {grouped.map((g, i) => (
            <div key={g.key} className="space-y-0.5">
              {heading(g.label, i === 0)}
              {nav(g.list)}
            </div>
          ))}
          {adminItems.length > 0 && (
            <div className="space-y-0.5">
              {heading("Administration")}
              {nav(adminItems)}
            </div>
          )}
        </nav>
        <div className="relative flex items-center gap-1 border-t border-white/10 p-3">
          <Link href="/profil" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.06]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold text-sm font-bold text-navy-900">
              {userName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-white">{userName}</span>
              <span className="block truncate text-[11px] text-white/45">{roleLabel}</span>
            </span>
          </Link>
          <form action={logout}>
            <button className="grid h-9 w-9 place-items-center rounded-lg text-white/55 transition hover:bg-white/[0.08] hover:text-white" aria-label="Déconnexion" title="Déconnexion">
              <LogOut size={17} />
            </button>
          </form>
        </div>
      </aside>
      {open && <div className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-black/45 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
