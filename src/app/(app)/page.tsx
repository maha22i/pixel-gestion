import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser, can } from "@/lib/auth";
import { TeamPulse } from "@/components/TeamPulse";
import { invoicesFinance } from "@/lib/finance";
import { PROJECT_TYPES, dateFr, fdj } from "@/lib/format";
import { PayBadge, QuoteBadge, Stat, Empty } from "@/components/ui";
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

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-white/80 bg-white/[0.78] p-4 shadow-[0_20px_42px_-34px_rgba(24,34,44,0.55)] backdrop-blur sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="h-section">Tableau de bord</p>
          <h1 className="break-words text-2xl font-bold leading-tight tracking-tight text-navy sm:text-[32px]">Bonjour {user.name.split(" ")[0]}</h1>
          <p className="capitalize text-navy-600/75">{monthName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user, "devis", "write") && <Link href="/devis/nouveau" className="btn-primary">+ Devis</Link>}
          {can(user, "depenses", "write") && <Link href="/depenses" className="btn-ghost">+ Dépense</Link>}
        </div>
      </div>

      {/* KPI du mois */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <Stat label="Facturé ce mois" value={fdj(cur.facture)} hint={delta(cur.facture, prev.facture)} />
        <Stat label="Encaissé ce mois" value={fdj(cur.encaisse)} hint={delta(cur.encaisse, prev.encaisse)} tone="green" />
        <Stat label="Dépenses ce mois" value={fdj(cur.depenses)} hint={delta(cur.depenses, prev.depenses)} tone="gold" />
        <Stat label="Résultat du mois" value={fdj(cur.encaisse - cur.depenses)} hint="Encaissé − dépenses" tone={cur.encaisse - cur.depenses >= 0 ? "green" : "red"} />
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Link href="/factures?s=impayees" className="block"><Stat label="Impayés (reste à encaisser)" value={fdj(remaining)} hint={`${live.filter((i) => i.remaining > 0).length} facture(s)`} tone="red" /></Link>
        <Link href="/factures?s=retard" className="block"><Stat label="En retard" value={overdue.length} hint={fdj(overdue.reduce((s, i) => s + i.remaining, 0))} tone={overdue.length ? "red" : "navy"} /></Link>
        <Link href="/devis?status=envoye" className="block"><Stat label="Devis en attente" value={pendingAgg.n} hint={fdj(Number(pendingAgg.s))} tone="gold" /></Link>
        <Stat label={`CA ${year}`} value={fdj(ytdInvoiced)} hint={`Encaissé ${fdj(ytdPaid)} · Dépenses ${fdj(ytdExp)}${conv.d ? ` · Conversion devis ${Math.round((conv.a / conv.d) * 100)} %` : ""}`} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card card-pad min-w-0 overflow-hidden">
          <p className="h-section mb-3">12 derniers mois</p>
          <MonthlyChart data={series} />
        </section>
        <section className="card card-pad">
          <p className="h-section mb-4">CA {year} par type de projet</p>
          <div className="space-y-4">
            {byType.map((t) => (
              <div key={t.k}>
                <div className="flex justify-between text-[15px] mb-1"><span className="font-bold">{t.label}</span><span className="tabular-nums">{fdj(t.value)}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-navy-50">
                  <div className={`h-full rounded-full ${t.k === "mariage" ? "bg-gold" : "bg-navy"}`} style={{ width: `${(t.value / maxType) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {can(user, "suivi_equipe") && <TeamPulse />}
      <div className="grid xl:grid-cols-2 gap-6">
        <section className="card">
          <div className="flex items-center justify-between px-5 pt-5 pb-2"><p className="h-section">À encaisser</p><Link href="/factures?s=impayees" className="text-sm link">Tout voir</Link></div>
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
          <div className="flex items-center justify-between px-5 pt-5 pb-2"><p className="h-section">Devis en attente</p><Link href="/devis" className="text-sm link">Tout voir</Link></div>
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
