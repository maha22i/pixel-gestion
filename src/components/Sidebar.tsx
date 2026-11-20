"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, FolderKanban, Package, FileText, Receipt, ScrollText, Wallet, TrendingDown,
  ShieldCheck, Settings, LogOut, Menu, X, UserCircle, CheckSquare, CalendarDays, BarChart3, Sun, Camera, ClipboardCheck,
  QrCode, CalendarCheck,
} from "lucide-react";

type Item = { href: string; label: string; icon: keyof typeof ICONS };
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
          className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-all ${
            active
              ? "bg-white/[0.14] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
              : "text-white/70 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          <Icon size={18} className={active ? "text-gold" : "text-white/70 group-hover:text-white"} />
          {it.label}
          {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />}
        </Link>
      );
    });

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-navy px-3 pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2">
          <img src="/logo.png" alt="Pixel Nomade" className="h-8 w-auto max-w-[42vw] object-contain object-left" />
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
        className={`fixed bottom-0 left-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-40 flex w-[min(19.5rem,88vw)] shrink-0 flex-col border-r border-white/10 bg-navy shadow-2xl transition-transform duration-200 lg:sticky lg:bottom-auto lg:top-0 lg:z-20 lg:h-screen lg:w-72 lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full max-lg:invisible"
        }`}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-12 -right-12 h-44 w-44 rounded-full bg-gold/25 blur-3xl" />
          <div className="absolute bottom-20 left-0 h-52 w-52 rounded-full bg-white/[0.08] blur-3xl" />
        </div>
        <div className="relative hidden px-5 pb-5 pt-6 lg:block">
          <img src="/logo.png" alt="Pixel Nomade" className="h-12 w-auto object-contain object-left" />
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/45">Pilotage d’entreprise</p>
        </div>
        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 pb-4 pt-4 lg:pt-0">
          {nav(items)}
          {adminItems.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Administration</p>
              {nav(adminItems)}
            </>
          )}
        </nav>
        <div className="relative border-t border-white/10 p-3">
          <Link href="/profil" className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 transition hover:bg-white/10">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gold font-bold text-navy-900">
              {userName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-white">{userName}</span>
              <span className="block text-[12px] text-white/45">{roleLabel}</span>
            </span>
          </Link>
          <form action={logout}>
            <button className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-white/[0.65] transition hover:bg-white/[0.06] hover:text-white">
              <LogOut size={16} /> Déconnexion
            </button>
          </form>
        </div>
      </aside>
      {open && <div className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-black/45 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
