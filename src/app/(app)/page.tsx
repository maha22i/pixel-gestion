import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser, can } from "@/lib/auth";
import { TeamPulse } from "@/components/TeamPulse";
import { PresenceToday } from "@/components/PresenceToday";
import { AlarmClock, ArrowRight, FileClock, FileText, Plus, Receipt, Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { invoicesFinance } from "@/lib/finance";
import { PROJECT_TYPES, dateFr, fdj } from "@/lib/format";
import { PayBadge, QuoteBadge, Stat, Empty, SectionCard } from "@/components/ui";
import { MonthlyChart } from "@/components/Charts";

const FIRST_ALLOWED = [
  ["taches", "/ma-journee"], ["presences", "/pointer"], ["clients", "/clients"], ["projets", "/projets"], ["catalogue", "/catalogue"],
  ["devis", "/devis"], ["contrats", "/contrats"], ["factures", "/factures"], ["paiements", "/paiements"],
  ["depenses", "/depenses"], ["planning", "/planning"], ["suivi_equipe", "/suivi"],
] as const;

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default async function Dashboard() {
  const user = await requireUser();
  if (!can(user, "tableau_de_bord")) {
    const first = FIRST_ALLOWED.find(([m]) => can(user, m));
    redirect(first ? first[1] : "/profil");
  }
  const now = new Date();
  const thisMonth = ym(now);
  const year = String(now.getFullYear());

  const invoices = await invoicesFinance();
  const live = invoices.filter((i) => i.status !== "annulee");

  const pay = (await db.execute(sql`
    SELECT to_char(date, 'YYYY-MM') AS m, SUM(amount)::bigint AS s FROM payments
    WHERE date >= date_trunc('month', now()) - interval '11 months' GROUP BY 1`)).rows as any[];
  const exp = (await db.execute(sql`
    SELECT to_char(date, 'YYYY-MM') AS m, SUM(amount)::bigint AS s FROM expenses
    WHERE date >= date_trunc('month', now()) - interval '11 months' GROUP BY 1`)).rows as any[];
  const ytdPaid = Number(((await db.execute(sql`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM payments WHERE to_char(date,'YYYY') = ${year}`)).rows[0] as any).s);
  const ytdExp = Number(((await db.execute(sql`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM expenses WHERE to_char(date,'YYYY') = ${year}`)).rows[0] as any).s);
  const pending = (await db.execute(sql`
    SELECT q.id, q.number, q.subject, q.total, q.status, q.issue_date, q.valid_until, c.name AS client_name
    FROM quotes q JOIN clients c ON c.id = q.client_id
    WHERE q.status IN ('brouillon','envoye') ORDER BY q.issue_date DESC LIMIT 6`)).rows as any[];
  const pendingAgg = (await db.execute(sql`
    SELECT count(*)::int AS n, COALESCE(SUM(total),0)::bigint AS s FROM quotes WHERE status IN ('brouillon','envoye')`)).rows[0] as any;
  const conv = (await db.execute(sql`
    SELECT count(*) FILTER (WHERE status = 'accepte')::int AS a, count(*) FILTER (WHERE status IN ('accepte','refuse','expire'))::int AS d
    FROM quotes WHERE to_char(issue_date,'YYYY') = ${year}`)).rows[0] as any;

  // 12 derniers mois
  const series = Array.from({ length: 12 }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + k, 1);
    const key = ym(d);
    return {
      label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "") + (d.getMonth() === 0 || k === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ""),
      facture: live.filter((i) => i.issueDate.startsWith(key)).reduce((s, i) => s + i.total, 0),
      encaisse: Number(pay.find((r) => r.m === key)?.s ?? 0),
      depenses: Number(exp.find((r) => r.m === key)?.s ?? 0),
    };
  });
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)} % vs mois dernier` : "—");

  const remaining = live.reduce((s, i) => s + i.remaining, 0);
  const overdue = live.filter((i) => i.overdue);
  const ytdInvoiced = live.filter((i) => i.issueDate.startsWith(year)).reduce((s, i) => s + i.total, 0);

  const byType = Object.entries(PROJECT_TYPES).map(([k, v]) => ({
    k, label: v, value: live.filter((i) => i.issueDate.startsWith(year) && i.projectType === k).reduce((s, i) => s + i.total, 0),
  }));
  const noProject = live.filter((i) => i.issueDate.startsWith(year) && !i.projectType).reduce((s, i) => s + i.total, 0);
  if (noProject) byType.push({ k: "none", label: "Sans projet", value: noProject });
  const maxType = Math.max(1, ...byType.map((t) => t.value));

  const toCollect = [...live.filter((i) => i.remaining > 0)].sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.remaining - a.remaining).slice(0, 6);
  const monthName = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const today = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Djibouti", hour: "2-digit", hourCycle: "h23" }).format(now));
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const result = cur.encaisse - cur.depenses;
  const watch = [
    { href: "/factures?s=impayees", icon: <Wallet size={17} />, label: "Reste à encaisser", value: fdj(remaining), note: `${live.filter((i) => i.remaining > 0).length} facture(s)`, tone: remaining ? "text-red-700" : "text-navy" },
    { href: "/factures?s=retard", icon: <AlarmClock size={17} />, label: "Factures en retard", value: String(overdue.length), note: fdj(overdue.reduce((s, i) => s + i.remaining, 0)), tone: overdue.length ? "text-red-700" : "text-navy" },
    { href: "/devis?status=envoye", icon: <FileClock size={17} />, label: "Devis en attente", value: String(pendingAgg.n), note: fdj(Number(pendingAgg.s)), tone: pendingAgg.n ? "text-amber-700" : "text-navy" },
    { href: "/factures", icon: <Scale size={17} />, label: `CA ${year}`, value: fdj(ytdInvoiced), note: `Encaissé ${fdj(ytdPaid)} · Dépenses ${fdj(ytdExp)}${conv.d ? ` · Conversion devis ${Math.round((conv.a / conv.d) * 100)} %` : ""}`, tone: "text-navy" },
  ];

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy-600/70">{today.charAt(0).toUpperCase() + today.slice(1)}</p>
          <h1 className="break-words text-2xl font-bold leading-tight tracking-tight text-navy sm:text-[32px]">{hello} {user.name.split(" ")[0]}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user, "devis", "write") && <Link href="/devis/nouveau" className="btn-primary"><Plus size={16} /> Devis</Link>}
          {can(user, "factures", "write") && <Link href="/factures/nouveau" className="btn-ghost"><Receipt size={16} /> Facture</Link>}
          {can(user, "depenses", "write") && <Link href="/depenses?nouveau=1" className="btn-ghost"><TrendingDown size={16} /> Dépense</Link>}
        </div>
      </div>

      {can(user, "presences", "write") && <PresenceToday />}

      {/* KPI du mois */}
      <p className="h-section mb-3 first-letter:uppercase">{monthName}</p>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Facturé" value={fdj(cur.facture)} hint={delta(cur.facture, prev.facture)} icon={<FileText size={18} />} />
        <Stat label="Encaissé" value={fdj(cur.encaisse)} hint={delta(cur.encaisse, prev.encaisse)} tone="green" icon={<TrendingUp size={18} />} />
        <Stat label="Dépenses" value={fdj(cur.depenses)} hint={delta(cur.depenses, prev.depenses)} tone="gold" icon={<TrendingDown size={18} />} />
        <Stat label="Résultat" value={fdj(result)} hint="Encaissé − dépenses" tone={result >= 0 ? "green" : "red"} icon={<Scale size={18} />} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard title="12 derniers mois" className="overflow-hidden">
          <MonthlyChart data={series} />
        </SectionCard>
        <SectionCard title="À surveiller" flush>
          <ul className="divide-y divide-navy-100/70">
            {watch.map((w) => (
              <li key={w.label}>
                <Link href={w.href} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-gold/10 sm:px-6">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-700">{w.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-navy-600/80">{w.label}</span>
                    <span className="block truncate text-xs text-navy-600/60">{w.note}</span>
                  </span>
                  <span className={`shrink-0 text-right text-[17px] font-bold tabular-nums ${w.tone}`}>{w.value}</span>
                  <ArrowRight size={15} className="shrink-0 text-navy-600/30 transition group-hover:translate-x-0.5 group-hover:text-navy" />
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title={`CA ${year} par type de projet`} className="mb-6">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {byType.map((t) => (
            <div key={t.k}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-bold text-navy">{t.label}</span>
                <span className="shrink-0 tabular-nums text-navy-600">{fdj(t.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-navy-50">
                <div className={`h-full rounded-full ${t.k === "mariage" ? "bg-gold" : "bg-navy"}`} style={{ width: `${(t.value / maxType) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {can(user, "suivi_equipe") && <TeamPulse />}
      <div className="grid xl:grid-cols-2 gap-6">
        <section className="card">
          <div className="flex items-center justify-between px-5 pb-2 pt-5 sm:px-6"><p className="h-section">À encaisser</p><Link href="/factures?s=impayees" className="link text-sm">Tout voir</Link></div>
          {toCollect.length === 0 ? <Empty title="Aucun impayé" /> : (
            <table className="table"><tbody>
              {toCollect.map((i) => (
                <tr key={i.id} className="clickable">
                  <td><Link href={`/factures/${i.id}`} className="link row-hit">{i.clientName}</Link><div className="text-sm text-navy-600/70">{i.number} · {dateFr(i.issueDate)}</div></td>
                  <td><PayBadge s={i.paymentStatus} overdue={i.overdue} /></td>
                  <td className="num font-bold text-red-700">{fdj(i.remaining)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </section>
        <section className="card">
          <div className="flex items-center justify-between px-5 pb-2 pt-5 sm:px-6"><p className="h-section">Devis en attente</p><Link href="/devis" className="link text-sm">Tout voir</Link></div>
          {pending.length === 0 ? <Empty title="Aucun devis en attente" /> : (
            <table className="table"><tbody>
              {pending.map((q) => (
                <tr key={q.id} className="clickable">
                  <td><Link href={`/devis/${q.id}`} className="link row-hit">{q.client_name}</Link><div className="text-sm text-navy-600/70">{q.number} · {q.subject}</div></td>
                  <td><QuoteBadge s={q.status} /></td>
                  <td className="num font-bold">{fdj(q.total)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </section>
      </div>
    </>
  );
}
