"use client";
import Link from "next/link";
import { LogOut } from "lucide-react";

export function TopBar({
  userName, roleLabel, logout, bell,
}: {
  userName: string;
  roleLabel: string;
  logout: () => void;
  bell: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-3 border-b border-gold/40 bg-white/95 px-4 backdrop-blur lg:flex">
      <div className="text-navy">{bell}</div>
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-navy/10 bg-navy py-1 pl-1 pr-3 text-white [&::-webkit-details-marker]:hidden">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gold text-sm font-bold text-navy">{userName.charAt(0).toUpperCase()}</span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-bold leading-tight">{userName}</span>
            <span className="block text-[11px] text-white/60">{roleLabel}</span>
          </span>
        </summary>
        <div className="absolute right-0 z-40 mt-2 w-52 max-w-[calc(100vw-1.5rem)] rounded-xl border border-gold/30 bg-white p-2 text-navy shadow-xl">
          <Link href="/profil" className="block rounded-lg px-3 py-2 text-sm font-bold hover:bg-gold/15">Mon profil</Link>
          <form action={logout}>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold hover:bg-gold/15">
              <LogOut size={16} /> Déconnexion
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
