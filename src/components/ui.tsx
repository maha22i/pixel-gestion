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

export function Stat({ label, value, hint, tone = "navy" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "navy" | "gold" | "red" | "green" }) {
  const toneCls = { navy: "text-navy", gold: "text-amber-700", red: "text-red-700", green: "text-emerald-700" }[tone];
  return (
    <div className="card card-pad">
      <p className="h-section">{label}</p>
      <p className={`mt-2 break-words text-[1.35rem] font-bold leading-none tabular-nums sm:text-[1.7rem] xl:text-[30px] ${toneCls}`}>{value}</p>
      {hint && <p className="mt-2 text-sm text-navy-600/75">{hint}</p>}
    </div>
  );
}
