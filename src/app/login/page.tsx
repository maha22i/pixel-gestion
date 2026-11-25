import { redirect } from "next/navigation";
import { ChartLine, MapPin, Phone, ShieldCheck, Zap } from "lucide-react";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { DesertScene } from "./DesertScene";

function safeNext(raw: string | undefined) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) return "/";
  return raw.slice(0, 300);
}

const FEATURES = [
  { icon: ChartLine, title: "Vision", text: "Flux de trésorerie lisible à chaque instant." },
  { icon: Zap, title: "Vitesse", text: "Actions courantes en quelques clics." },
  { icon: ShieldCheck, title: "Fiabilité", text: "Suivi centralisé des données financières." },
];

export default async function LoginPage({ searchParams }: { searchParams: { e?: string; next?: string } }) {
  if (await getUser()) redirect(safeNext(searchParams.next));
  return (
    <main className="min-h-screen bg-[#f5f7fb] lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Panneau de marque (ordinateur) */}
      <section className="relative hidden overflow-hidden bg-[#1c2c3f] text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_62%,rgba(245,166,35,0.22),transparent_45%),linear-gradient(180deg,#1b2a3c_0%,#22364d_55%,#2a4160_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />
        <div className="relative z-10 px-14 pt-12 xl:px-20 [@media(max-height:800px)]:pt-8">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-bold tracking-[0.24em] text-gold backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-[2px] bg-gold" />
            PIXEL NOMADE · GESTION
          </p>

          <div className="mt-10 max-w-xl xl:mt-16 [@media(max-height:800px)]:mt-7">
            <h1 className="text-[44px] font-bold leading-[1.05] tracking-tight xl:text-[52px] [@media(max-height:800px)]:text-[40px]">
              Finance claire,
              <br />
              pilotage rapide,
              <br />
              <span className="bg-gradient-to-r from-gold to-amber-300 bg-clip-text text-transparent">esprit Pixel Nomade.</span>
            </h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/70">
              Devis, factures et encaissements réunis dans un cockpit pensé pour les équipes terrain.
            </p>

            <ul className="mt-8 space-y-3.5 [@media(max-height:800px)]:mt-6">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-center gap-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </span>
                  <p className="text-[15px] text-white/80">
                    <span className="font-bold text-white">{title}</span>
                    <span className="mx-2 text-white/30">—</span>
                    {text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Paysage : occupe la hauteur restante, sans jamais recouvrir le texte */}
        <div className="relative mt-6 min-h-[200px] flex-1">
          <DesertScene id="pn-desk" className="absolute inset-0 h-full w-full" />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-14 pb-8 text-sm text-white/60 xl:px-20">
          <p className="inline-flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gold/80" /> Saline Ouest, Djibouti
          </p>
          <p className="inline-flex items-center gap-2 font-semibold text-white/75">
            <Phone className="h-4 w-4 text-gold/80" /> +253 77 36 06 07
          </p>
        </div>
      </section>

      {/* Formulaire */}
      <section className="relative flex min-h-screen flex-col">
        {/* Bandeau de marque (mobile) */}
        <div className="relative h-56 overflow-hidden bg-gradient-to-b from-[#1b2a3c] to-[#2a4160] lg:hidden">
          <DesertScene id="pn-mobile" className="absolute inset-0 h-full w-full" />
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-8 sm:px-10 lg:py-10">
          <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle_at_85%_10%,rgba(245,166,35,0.10),transparent_35%),radial-gradient(circle_at_10%_90%,rgba(44,62,80,0.08),transparent_40%)] lg:block" />
          <div className="relative -mt-14 w-full max-w-[420px] lg:mt-0">
            <LoginForm error={searchParams.e} next={safeNext(searchParams.next)} />
            <p className="mt-6 text-center text-xs text-navy-600/60">
              © {new Date().getFullYear()} Pixel Nomade
              <span className="lg:hidden"> · Saline Ouest, Djibouti</span>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
