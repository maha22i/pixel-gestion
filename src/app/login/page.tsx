import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

function safeNext(raw: string | undefined) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) return "/";
  return raw.slice(0, 300);
}

export default async function LoginPage({ searchParams }: { searchParams: { e?: string; next?: string } }) {
  if (await getUser()) redirect(safeNext(searchParams.next));
  return (
    <main className="grid min-h-screen bg-gradient-to-b from-[#f8fafd] via-[#f2f5fa] to-[#edf1f8] lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#1f2f42] text-white lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_86%_8%,rgba(245,166,35,0.36),transparent_36%),radial-gradient(circle_at_12%_86%,rgba(144,190,255,0.18),transparent_35%),linear-gradient(145deg,#243a54_0%,#1f2f42_42%,#172433_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:54px_54px] opacity-[0.22]" />
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-gold/65 blur-2xl" />
        <div className="absolute -left-24 bottom-10 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="absolute right-12 top-24 grid grid-cols-4 gap-2 opacity-90">
          {Array.from({ length: 16 }).map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-[3px] ${
                i % 5 === 0 ? "bg-white/85" : i % 2 === 0 ? "bg-gold/90" : "bg-white/20"
              }`}
            />
          ))}
        </div>

        <div className="relative z-10">
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-bold tracking-[0.24em] text-gold backdrop-blur-md">
            PIXEL NOMADE
          </p>
        </div>

        <div className="relative z-10 max-w-xl">
          <h1 className="text-5xl font-bold leading-[1.06] tracking-tight text-white">
            Finance claire,
            <br />
            pilotage rapide,
            <br />
            <span className="text-gold">esprit Pixel Nomade.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/78">
            Une expérience métier conçue pour les équipes terrain: devis, factures et encaissements réunis dans un cockpit élégant, lisible et efficace.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold/90">Vision</p>
              <p className="mt-1 text-sm text-white/85">Flux de trésorerie lisible à chaque instant.</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold/90">Vitesse</p>
              <p className="mt-1 text-sm text-white/85">Actions courantes en quelques clics.</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold/90">Fiabilite</p>
              <p className="mt-1 text-sm text-white/85">Suivi centralise des donnees financieres.</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-sm text-white/60">
          <p>Saline Ouest, Djibouti</p>
          <p className="font-semibold text-white/75">+253 77 36 06 07</p>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-8 sm:p-10">
        <LoginForm error={searchParams.e} next={safeNext(searchParams.next)} />
      </section>
    </main>
  );
}
