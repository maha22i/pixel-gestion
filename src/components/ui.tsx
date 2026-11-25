import Link from "next/link";
import { PAYMENT_STATUS, PROJECT_STATUS, QUOTE_STATUS, TASK_STATUS, taskSignal } from "@/lib/format";

export function PageHeader({
  title, subtitle, actions, back,
}: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-7">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm font-bold text-navy-600/80 transition hover:text-gold-600">
          <span aria-hidden>←</span> {back.label}
        </Link>
      )}
      <div className="mt-2 flex flex-col items-stretch gap-3 border-l-4 border-gold pl-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-[1.45rem] font-bold leading-tight tracking-tight text-navy sm:text-[30px] sm:leading-[1.05]">{title}</h1>
          {subtitle && <div className="mt-1.5 break-words text-navy-600/80">{subtitle}</div>}
        </div>
        {actions && <div className="flex max-w-full flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 grid w-fit grid-cols-2 gap-1 opacity-70">
        <span className="h-2.5 w-2.5 rounded-sm bg-gold" /><span className="h-2.5 w-2.5 rounded-sm bg-navy-200" />
        <span className="h-2.5 w-2.5 rounded-sm bg-navy-200" /><span className="h-2.5 w-2.5 rounded-sm bg-gold" />
      </div>
      <p className="text-[17px] font-bold text-navy">{title}</p>
      {children && <div className="mt-1.5 text-sm text-navy-600/75">{children}</div>}
    </div>
  );
}

const QUOTE_CLS: Record<string, string> = {
  brouillon: "badge-gray", envoye: "badge-blue", accepte: "badge-green", refuse: "badge-red", expire: "badge-gray",
};
export function QuoteBadge({ s }: { s: string }) {
  return <span className={QUOTE_CLS[s] ?? "badge-gray"}>{QUOTE_STATUS[s] ?? s}</span>;
}

const PAY_CLS: Record<string, string> = {
  non_payee: "badge-red", acompte: "badge-gold", partielle: "badge-gold", soldee: "badge-green", annulee: "badge-gray",
};
export function PayBadge({ s, overdue }: { s: string; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={PAY_CLS[s] ?? "badge-gray"}>{PAYMENT_STATUS[s] ?? s}</span>
      {overdue && <span className="badge bg-red-600 text-white">En retard</span>}
    </span>
  );
}

const PROJ_CLS: Record<string, string> = {
  prospect: "badge-gray", confirme: "badge-blue", en_cours: "badge-gold", livre: "badge-green", cloture: "badge-navy", annule: "badge-red",
};
export function ProjectBadge({ s }: { s: string }) {
  return <span className={PROJ_CLS[s] ?? "badge-gray"}>{PROJECT_STATUS[s] ?? s}</span>;
}

export function TaskMark({ status, due, day, aside = false }: { status: string; due?: string | Date | null; day: string; aside?: boolean }) {
  const signal = taskSignal(status, due, day);
  const showStatus = aside && signal.late && status !== "a_faire" && status !== "termine" && status !== "annule";
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <span className={signal.badge}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
        {signal.label}
      </span>
      {showStatus && (
        <span className={status === "en_cours" ? "badge-blue" : "badge-gold"}>
          {TASK_STATUS[status] ?? status}
        </span>
      )}
    </span>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

const STAT_TONE = {
  navy: { text: "text-navy", chip: "bg-navy-50 text-navy-700" },
  gold: { text: "text-amber-700", chip: "bg-gold-100 text-amber-800" },
  red: { text: "text-red-700", chip: "bg-red-50 text-red-700" },
  green: { text: "text-emerald-700", chip: "bg-emerald-50 text-emerald-700" },
  blue: { text: "text-sky-800", chip: "bg-sky-50 text-sky-700" },
} as const;

/** Indicateur chiffré. `icon` facultatif (icône lucide déjà rendue, ex. <Wallet size={18} />). */
export function Stat({
  label, value, hint, tone = "navy", icon, className = "",
}: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: keyof typeof STAT_TONE; icon?: React.ReactNode; className?: string;
}) {
  const t = STAT_TONE[tone];
  return (
    <div className={`card card-pad h-full ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="h-section">{label}</p>
        {icon && <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.chip}`}>{icon}</span>}
      </div>
      <p className={`mt-2 break-words text-[1.35rem] font-bold leading-none tabular-nums sm:text-[1.6rem] xl:text-[28px] ${t.text}`}>{value}</p>
      {hint && <p className="mt-2 text-sm text-navy-600/75">{hint}</p>}
    </div>
  );
}

/** Carte avec un en-tête (titre + action à droite) et un contenu. `flush` retire le padding du contenu (tableaux, listes). */
export function SectionCard({
  title, action, children, flush = false, className = "", id,
}: {
  title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; flush?: boolean; className?: string; id?: string;
}) {
  return (
    <section id={id} className={`card min-w-0 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-5 sm:px-6">
        <h2 className="h-section">{title}</h2>
        {action && <div className="flex flex-wrap items-center gap-2 text-sm">{action}</div>}
      </div>
      <div className={flush ? "" : "px-5 pb-5 sm:px-6 sm:pb-6"}>{children}</div>
    </section>
  );
}

/** Pastille avec initiales, couleur de l'utilisateur. */
export function Avatar({ name, color, size = 32 }: { name: string; color?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: color || "#2C3E50" }}
    >
      {initials}
    </span>
  );
}

/** Barre de progression simple (0–100). */
export function Progress({ value, tone = "navy" }: { value: number; tone?: "navy" | "gold" | "green" | "red" }) {
  const bar = { navy: "bg-navy", gold: "bg-gold", green: "bg-emerald-500", red: "bg-red-500" }[tone];
  return (
    <div className="h-2 overflow-hidden rounded-full bg-navy-50">
      <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
