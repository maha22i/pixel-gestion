import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  AlertTriangle, ArrowLeft, Banknote, BriefcaseBusiness, Check, ClipboardList, Paperclip, Pencil, Plus, Stethoscope, TreePalm, UserRoundCheck, Users, X,
} from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { fdj, today as todayIso } from "@/lib/format";
import { CONTRACT_TYPE, LEAVE_KIND, LEAVE_STATUS, canSeeLeave, canSeePayroll, canValidateLeave, currentContracts, leaveBalances } from "@/lib/rh";
import { Avatar, Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { Modal } from "@/components/Modal";
import { ConfirmButton, SubmitButton } from "@/components/ConfirmButton";
import { cancelLeave, decideLeave, deleteContract, saveContract } from "./actions";

export const dynamic = "force-dynamic";

const dayFr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const OK: Record<string, string> = {
  approuve: "Demande validée. L'absence apparaît dans les présences.",
  refuse: "Demande refusée. L'employé est prévenu.",
  annulee: "Absence annulée.",
  contrat: "Contrat enregistré.",
  supprime: "Contrat supprimé.",
};
const ERR: Record<string, string> = {
  chevauche: "Cet employé a déjà une absence enregistrée sur ces dates. Retirez-la dans Présences avant de valider.",
  motif: "Indiquez le motif du refus.",
  contrat: "Vérifiez le type et les dates du contrat.",
  taille: "Le fichier dépasse 15 Mo.",
  format: "Le document doit être un PDF ou une photo.",
};

type Person = { id: number; name: string; color: string; jobTitle: string | null };

export default async function RhPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requireUser();
  if (!canSeeLeave(user)) redirect("/acces-refuse");
  const validate = canValidateLeave(user);
  const payroll = canSeePayroll(user);
  const vue = searchParams.vue === "equipe" && payroll ? "equipe" : "demandes";
  const today = todayIso();
  const people: Person[] = (await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color, jobTitle: schema.users.jobTitle })
    .from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name))).map((p) => ({ ...p, color: p.color || "#2C3E50" }));
  const pendingCount = Number(((await db.execute(sql`SELECT COUNT(*)::int AS n FROM leave_requests WHERE status = 'en_attente'`)).rows[0] as { n: number }).n);

  const tab = (key: string, href: string, label: React.ReactNode) => (
    <Link href={href} aria-current={vue === key ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold transition ${vue === key ? "bg-white text-navy ring-1 ring-navy-100" : "text-navy-600/75 hover:text-navy"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Ressources humaines"
        subtitle={payroll ? "Demandes de congés et d'absences, contrats et salaires de l'équipe." : "Demandes de congés et d'absences de l'équipe."}
        actions={
          <nav className="flex gap-1 rounded-xl bg-navy-50/80 p-1 ring-1 ring-navy-100/70">
            {tab("demandes", "/rh", <>Demandes{pendingCount > 0 && <span className="rounded-full bg-gold px-1.5 text-[11px] text-navy-900">{pendingCount}</span>}</>)}
            {payroll && tab("equipe", "/rh?vue=equipe", "Contrats & salaires")}
          </nav>
        }
      />
      <Flash message={OK[searchParams.ok ?? ""] ?? ""} clear={["ok"]} />
      <Flash tone="error" message={!searchParams.refuser && !searchParams.contrat ? ERR[searchParams.e ?? ""] ?? "" : ""} clear={["e"]} />
      {vue === "demandes" ? <Requests validate={validate} people={people} today={today} refuseId={Number(searchParams.refuser) || 0} refuseError={searchParams.refuser ? ERR[searchParams.e ?? ""] : ""} /> : (
        <Team people={people} today={today} employeeId={Number(searchParams.employe) || 0} contractParam={searchParams.contrat} formError={searchParams.contrat ? ERR[searchParams.e ?? ""] : ""} />
      )}
    </>
  );
}

/* ─────────────────────────── Demandes ─────────────────────────── */

async function Requests({ validate, people, today, refuseId, refuseError }: { validate: boolean; people: Person[]; today: string; refuseId: number; refuseError?: string }) {
  const all = await db.select().from(schema.leaveRequests).orderBy(desc(schema.leaveRequests.createdAt)).limit(200);
  const pending = all.filter((r) => r.status === "en_attente").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const history = all.filter((r) => r.status !== "en_attente").slice(0, 60);
  const who = new Map(people.map((p) => [p.id, p]));
  const names = new Map((await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)).map((u) => [u.id, u.name]));
  const balances = await leaveBalances([...new Set(pending.map((r) => r.userId))], today);
  const month = today.slice(0, 7);
  const awayToday = await db.select({ userId: schema.attendanceAbsences.userId }).from(schema.attendanceAbsences)
    .where(and(lte(schema.attendanceAbsences.startDate, today), gte(schema.attendanceAbsences.endDate, today)));
  const thisMonth = all.filter((r) => r.status === "approuve" && r.startDate.slice(0, 7) <= month && r.endDate.slice(0, 7) >= month);
  const refusing = pending.find((r) => r.id === refuseId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="À traiter" value={pending.length} hint={pending.length ? "Demande(s) en attente" : "Tout est traité"} tone={pending.length ? "gold" : "green"} icon={<ClipboardList size={18} />} />
        <Stat label="Absents aujourd'hui" value={new Set(awayToday.map((a) => a.userId)).size} hint="Congés, maladie, autres" tone="blue" icon={<UserRoundCheck size={18} />} />
        <Stat label="Congés ce mois" value={`${thisMonth.filter((r) => r.kind === "conge").reduce((s, r) => s + r.days, 0)} j`} hint="Congés payés validés" icon={<TreePalm size={18} />} />
        <Stat label="Arrêts maladie ce mois" value={thisMonth.filter((r) => r.kind === "maladie").length} hint="Avec certificat" tone={thisMonth.some((r) => r.kind === "maladie") ? "red" : "navy"} icon={<Stethoscope size={18} />} />
      </div>

      <section>
        <h2 className="h-section mb-3">À traiter ({pending.length})</h2>
        {pending.length === 0 ? <div className="card"><Empty title="Aucune demande en attente">Les nouvelles demandes apparaîtront ici et vous serez notifié.</Empty></div> : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pending.map((r) => {
              const p = who.get(r.userId);
              const b = balances.get(r.userId);
              const k = LEAVE_KIND[r.kind];
              const short = r.kind === "conge" && b && b.left < 0;
              const soon = diffDays(today, r.startDate);
              return (
                <article key={r.id} className="card flex flex-col">
                  <div className="flex items-start gap-3 p-5">
                    <Avatar name={p?.name ?? names.get(r.userId) ?? "?"} color={p?.color} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-navy">{p?.name ?? names.get(r.userId)}</p>
                      <p className="text-xs text-navy-600/70">{p?.jobTitle || "—"} · demandé le {dayFr(r.createdAt.toISOString().slice(0, 10))}</p>
                    </div>
                    <span className={r.kind === "maladie" ? "badge-red" : r.kind === "conge" ? "badge-green" : "badge-blue"}>{k?.label ?? r.kind}</span>
                  </div>
                  <div className="space-y-2 border-t border-navy-100 px-5 py-4 text-sm">
                    <p className="text-navy-800">Du <b>{dayFr(r.startDate)}</b> au <b>{dayFr(r.endDate)}</b> · <b>{r.days} jour{r.days > 1 ? "s" : ""}</b> ouvré{r.days > 1 ? "s" : ""}
                      {soon >= 0 && soon <= 3 && <span className="badge-gold ml-2">{soon === 0 ? "aujourd'hui" : `dans ${soon} j`}</span>}
                      {soon < 0 && <span className="badge-gray ml-2">déjà commencé</span>}
                    </p>
                    {r.kind === "conge" && b && (
                      <p className={short ? "flex items-center gap-1.5 font-semibold text-red-700" : "text-navy-600/80"}>
                        {short && <AlertTriangle size={15} />} Solde après validation : {b.left} j sur {b.entitled}
                      </p>
                    )}
                    {r.reason && <p className="rounded-lg bg-navy-50/70 px-3 py-2 text-navy-700">« {r.reason} »</p>}
                    {r.docStored
                      ? <a href={`/api/fichiers/rh/demande/${r.id}`} target="_blank" className="link inline-flex items-center gap-1"><Paperclip size={14} /> {k?.needsDoc ? "Certificat médical" : "Justificatif"} : {r.docFilename}</a>
                      : k?.needsDoc && <p className="font-semibold text-red-700">Certificat manquant</p>}
                  </div>
                  {validate ? <div className="mt-auto flex justify-end gap-2 border-t border-navy-100 bg-navy-50/40 px-5 py-3">
                    <Link href={`/rh?refuser=${r.id}`} scroll={false} className="btn-ghost"><X size={16} /> Refuser</Link>
                    <form action={decideLeave}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="approuve" />
                      <SubmitButton className="btn-primary"><Check size={16} /> Valider</SubmitButton>
                    </form>
                  </div> : <p className="mt-auto border-t border-navy-100 px-5 py-3 text-xs text-navy-600/70">Consultation seule : la validation est réservée aux personnes autorisées.</p>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="h-section px-5 pb-2 pt-5 sm:px-6">Historique</h2>
        {history.length === 0 ? <p className="px-5 pb-5 text-sm text-navy-600/70 sm:px-6">Aucune demande traitée.</p> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Employé</th><th>Type</th><th>Période</th><th className="text-right">Jours</th><th>Statut</th><th>Décision</th><th></th></tr></thead>
              <tbody>
                {history.map((r) => {
                  const st = LEAVE_STATUS[r.status] ?? LEAVE_STATUS.annule;
                  const p = who.get(r.userId);
                  return (
                    <tr key={r.id}>
                      <td><span className="flex items-center gap-2.5"><Avatar name={p?.name ?? names.get(r.userId) ?? "?"} color={p?.color} size={28} /><b className="text-navy">{p?.name ?? names.get(r.userId)}</b></span></td>
                      <td>{LEAVE_KIND[r.kind]?.label ?? r.kind}{r.docStored && <a href={`/api/fichiers/rh/demande/${r.id}`} target="_blank" className="ml-1.5 inline-flex text-navy-600 hover:text-navy" title="Justificatif"><Paperclip size={14} /></a>}</td>
                      <td className="whitespace-nowrap text-sm">{dayFr(r.startDate)} → {dayFr(r.endDate)}</td>
                      <td className="num">{r.days}</td>
                      <td><span className={st.badge}>{st.label}</span></td>
                      <td className="text-sm text-navy-600/80">{r.decidedBy ? names.get(r.decidedBy) : "—"}{r.decisionNote ? ` · ${r.decisionNote}` : ""}</td>
                      <td className="text-right">
                        {validate && r.status === "approuve" && r.endDate >= today && (
                          <form action={cancelLeave}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="back" value="/rh" />
                            <ConfirmButton className="btn-ghost btn-sm" message="Annuler cette absence validée ? Elle sera retirée des présences.">Annuler</ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {validate && refusing && (
        <Modal closeHref="/rh" labelledBy="refuse-title" width="max-w-md">
          <form action={decideLeave}>
            <input type="hidden" name="id" value={refusing.id} />
            <input type="hidden" name="decision" value="refuse" />
            <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-5 py-4">
              <h2 id="refuse-title" className="text-lg font-bold text-navy">Refuser la demande</h2>
              <Link href="/rh" scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Fermer"><X size={18} /></Link>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-navy-700">
                {who.get(refusing.userId)?.name} · {LEAVE_KIND[refusing.kind]?.label} du {dayFr(refusing.startDate)} au {dayFr(refusing.endDate)}
              </p>
              <label className="block"><span className="label">Motif du refus</span>
                <textarea name="note" className="input" rows={3} required autoFocus placeholder="ex. Tournage prévu ce jour-là, proposez une autre date" />
              </label>
              <p className="text-xs text-navy-600/65">Le motif est envoyé à l'employé.</p>
              {refuseError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{refuseError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-navy-100 bg-navy-50/40 px-5 py-4">
              <Link href="/rh" scroll={false} className="btn-ghost">Annuler</Link>
              <SubmitButton className="btn-danger">Refuser la demande</SubmitButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ─────────────────────────── Contrats & salaires (admin) ─────────────────────────── */

async function Team({ people, today, employeeId, contractParam, formError }: { people: Person[]; today: string; employeeId: number; contractParam?: string; formError?: string }) {
  const ids = people.map((p) => p.id);
  const contracts = await currentContracts(ids, today);
  const balances = await leaveBalances(ids, today);
  const payroll = [...contracts.values()].reduce((s, c) => s + c.monthlySalary, 0);
  const ending = [...contracts.values()].filter((c) => c.endDate && diffDays(today, c.endDate) <= 60);
  const without = people.filter((p) => !contracts.has(p.id));
  const selected = people.find((p) => p.id === employeeId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Masse salariale" value={fdj(payroll)} hint="Salaires mensuels des contrats en cours" icon={<Banknote size={18} />} />
        <Stat label="Sous contrat" value={`${contracts.size} / ${people.length}`} hint={without.length ? `${without.length} sans contrat enregistré` : "Toute l'équipe"} tone={without.length ? "gold" : "green"} icon={<Users size={18} />} />
        <Stat label="Contrats qui se terminent" value={ending.length} hint="Dans les 60 prochains jours" tone={ending.length ? "red" : "navy"} icon={<AlertTriangle size={18} />} />
        <Stat label="Congés pris" value={`${[...balances.values()].reduce((s, b) => s + b.taken, 0)} j`} hint={`Toute l'équipe, ${today.slice(0, 4)}`} icon={<TreePalm size={18} />} />
      </div>

      <section className="card">
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-5 sm:px-6">
          <h2 className="h-section">Équipe</h2>
          <p className="text-xs text-navy-600/65">Cliquez sur une personne pour voir ou modifier son contrat.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Employé</th><th>Contrat</th><th>Depuis</th><th>Fin</th><th className="text-right">Salaire mensuel</th><th className="text-right">Congés restants</th></tr></thead>
            <tbody>
              {people.map((p) => {
                const c = contracts.get(p.id);
                const b = balances.get(p.id)!;
                const left = c?.endDate ? diffDays(today, c.endDate) : null;
                return (
                  <tr key={p.id} className="clickable">
                    <td>
                      <Link href={`/rh?vue=equipe&employe=${p.id}`} scroll={false} className="row-hit flex items-center gap-3">
                        <Avatar name={p.name} color={p.color} size={32} />
                        <span className="min-w-0"><span className="block font-bold text-navy">{p.name}</span><span className="block text-xs text-navy-600/70">{c?.jobTitle || p.jobTitle || "—"}</span></span>
                      </Link>
                    </td>
                    <td>{c ? <span className="badge-navy">{CONTRACT_TYPE[c.contractType] ?? c.contractType}</span> : <span className="badge-gold">Aucun contrat</span>}</td>
                    <td className="whitespace-nowrap text-sm">{c ? dayFr(c.startDate) : "—"}</td>
                    <td className="whitespace-nowrap text-sm">
                      {c?.endDate ? <>{dayFr(c.endDate)}{left !== null && left <= 60 && <span className="badge-red ml-2">{left} j</span>}</> : c ? "Indéterminée" : "—"}
                    </td>
                    <td className="num font-bold text-navy">{c ? fdj(c.monthlySalary) : "—"}</td>
                    <td className={`num ${b.left < 0 ? "font-bold text-red-700" : ""}`}>{b.left} / {b.entitled} j</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selected && <EmployeeModal person={selected} today={today} contractParam={contractParam} formError={formError} balance={balances.get(selected.id)!} />}
    </div>
  );
}

async function EmployeeModal({ person, today, contractParam, formError, balance }: {
  person: Person; today: string; contractParam?: string; formError?: string; balance: { entitled: number; taken: number; pending: number; left: number };
}) {
  const history = await db.select().from(schema.employmentContracts).where(eq(schema.employmentContracts.userId, person.id)).orderBy(desc(schema.employmentContracts.startDate));
  const current = (await currentContracts([person.id], today)).get(person.id);
  const leaves = await db.select().from(schema.leaveRequests)
    .where(and(eq(schema.leaveRequests.userId, person.id), inArray(schema.leaveRequests.status, ["approuve", "en_attente"])))
    .orderBy(desc(schema.leaveRequests.startDate)).limit(5);
  const base = `/rh?vue=equipe&employe=${person.id}`;
  const editing = contractParam === "nouveau" ? null : history.find((c) => c.id === Number(contractParam));
  const showForm = contractParam === "nouveau" || !!editing;

  return (
    <Modal closeHref="/rh?vue=equipe" labelledBy="emp-title" width="max-w-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-navy-100 bg-white px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Avatar name={person.name} color={person.color} size={42} />
          <div>
            <h2 id="emp-title" className="text-lg font-bold text-navy">{person.name}</h2>
            <p className="text-sm text-navy-600/70">{current?.jobTitle || person.jobTitle || "—"}</p>
          </div>
        </div>
        <Link href="/rh?vue=equipe" scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Fermer"><X size={18} /></Link>
      </div>

      {showForm ? (
        <form action={saveContract}>
          <input type="hidden" name="userId" value={person.id} />
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <div className="sm:col-span-2">
              <Link href={base} scroll={false} className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600/80 hover:text-navy"><ArrowLeft size={15} /> Retour</Link>
              <h3 className="mt-2 font-bold text-navy">{editing ? "Modifier le contrat" : "Nouveau contrat"}</h3>
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="label">Type de contrat</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CONTRACT_TYPE).map(([k, label]) => (
                  <label key={k} className="cursor-pointer">
                    <input type="radio" name="contractType" value={k} defaultChecked={(editing?.contractType ?? "cdi") === k} className="peer sr-only" />
                    <span className="inline-flex h-9 items-center rounded-lg border border-navy-200 bg-white px-4 text-sm font-semibold text-navy-700 transition peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold/60">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block sm:col-span-2"><span className="label">Poste</span><input name="jobTitle" className="input" defaultValue={editing?.jobTitle ?? person.jobTitle ?? ""} placeholder="ex. Cadreur" /></label>
            <label className="block"><span className="label">Date de début</span><input type="date" name="startDate" className="input" defaultValue={editing?.startDate ?? today} required /></label>
            <label className="block"><span className="label">Date de fin <span className="font-normal text-navy-600/60">(CDD, stage)</span></span><input type="date" name="endDate" className="input" defaultValue={editing?.endDate ?? ""} /></label>
            <label className="block"><span className="label">Salaire mensuel brut</span>
              <span className="relative block">
                <input name="monthlySalary" type="number" min={0} step={1000} inputMode="numeric" className="input pr-14 font-bold" defaultValue={editing?.monthlySalary ?? ""} required />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-navy-600/60">FDJ</span>
              </span>
            </label>
            <label className="block"><span className="label">Heures par semaine</span><input name="weeklyHours" type="number" min={1} max={80} className="input" defaultValue={editing?.weeklyHours ?? 40} /></label>
            <label className="block"><span className="label">Congés payés par an (jours)</span><input name="leaveDaysPerYear" type="number" min={0} max={60} className="input" defaultValue={editing?.leaveDaysPerYear ?? 30} /></label>
            <label className="block"><span className="label">Contrat signé <span className="font-normal text-navy-600/60">(PDF ou photo)</span></span>
              <input type="file" name="doc" accept="application/pdf,image/*" className="block w-full pt-2 text-sm text-navy-700" />
              {editing?.docStored && <span className="mt-1 block text-xs text-navy-600/65">Actuel : {editing.docFilename}. Un nouveau fichier le remplace.</span>}
            </label>
            <label className="block sm:col-span-2"><span className="label">Notes <span className="font-normal text-navy-600/60">(primes, avantages, période d'essai…)</span></span><textarea name="notes" className="input" rows={2} defaultValue={editing?.notes ?? ""} /></label>
            {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 sm:col-span-2">{formError}</p>}
          </div>
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
            <span />
            <span className="flex gap-2">
              <Link href={base} scroll={false} className="btn-ghost">Annuler</Link>
              <SubmitButton>Enregistrer le contrat</SubmitButton>
            </span>
          </div>
        </form>
      ) : (
        <div className="space-y-5 p-5 sm:p-6">
          {current ? (
            <section className="rounded-xl border border-navy-100">
              <div className="flex items-center justify-between gap-2 border-b border-navy-100 px-4 py-3">
                <p className="flex items-center gap-2 font-bold text-navy"><BriefcaseBusiness size={16} className="text-gold-600" /> Contrat en cours <span className="badge-navy">{CONTRACT_TYPE[current.contractType]}</span></p>
                <Link href={`${base}&contrat=${current.id}`} scroll={false} className="btn-ghost btn-sm"><Pencil size={14} /> Modifier</Link>
              </div>
              <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2">
                {[
                  ["Salaire mensuel", fdj(current.monthlySalary)],
                  ["Temps de travail", `${current.weeklyHours} h / semaine`],
                  ["Début", dayFr(current.startDate)],
                  ["Fin", current.endDate ? dayFr(current.endDate) : "Indéterminée"],
                  ["Congés annuels", `${current.leaveDaysPerYear} j`],
                  ["Solde congés", `${balance.left} j (pris ${balance.taken}, en attente ${balance.pending})`],
                ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-navy-600/75">{k}</dt><dd className="text-right font-semibold text-navy">{v}</dd></div>)}
              </dl>
              {(current.notes || current.docStored) && (
                <div className="border-t border-navy-100 px-4 py-3 text-sm">
                  {current.notes && <p className="whitespace-pre-wrap text-navy-700">{current.notes}</p>}
                  {current.docStored && <a href={`/api/fichiers/rh/contrat/${current.id}`} target="_blank" className="link mt-1 inline-flex items-center gap-1 text-xs"><Paperclip size={13} /> {current.docFilename}</a>}
                </div>
              )}
            </section>
          ) : (
            <div className="rounded-xl border border-dashed border-navy-200 px-4 py-6 text-center">
              <p className="font-bold text-navy">Aucun contrat en cours</p>
              <p className="mt-1 text-sm text-navy-600/70">Enregistrez son contrat pour suivre son salaire et ses congés.</p>
            </div>
          )}

          <Link href={`${base}&contrat=nouveau`} scroll={false} className="btn-gold w-full"><Plus size={16} /> {current ? "Nouveau contrat (renouvellement, avenant…)" : "Enregistrer un contrat"}</Link>

          {history.filter((c) => c.id !== current?.id).length > 0 && (
            <section>
              <h3 className="h-section mb-2">Contrats précédents ou à venir</h3>
              <ul className="divide-y divide-navy-100 rounded-xl border border-navy-100">
                {history.filter((c) => c.id !== current?.id).map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span><b className="text-navy">{CONTRACT_TYPE[c.contractType]}</b> · {dayFr(c.startDate)} → {c.endDate ? dayFr(c.endDate) : "…"} · {fdj(c.monthlySalary)}</span>
                    <span className="flex gap-1">
                      <Link href={`${base}&contrat=${c.id}`} scroll={false} className="btn-ghost btn-sm">Modifier</Link>
                      <form action={deleteContract}><input type="hidden" name="id" value={c.id} /><ConfirmButton className="btn-danger btn-sm" message="Supprimer ce contrat ?">Supprimer</ConfirmButton></form>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {leaves.length > 0 && (
            <section>
              <h3 className="h-section mb-2">Dernières absences</h3>
              <ul className="space-y-1 text-sm">
                {leaves.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span>{LEAVE_KIND[l.kind]?.label} · {dayFr(l.startDate)} → {dayFr(l.endDate)} ({l.days} j)</span>
                    <span className={LEAVE_STATUS[l.status]?.badge}>{LEAVE_STATUS[l.status]?.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
