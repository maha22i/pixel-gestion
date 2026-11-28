import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { BriefcaseBusiness, CalendarClock, Clock, Hourglass, Paperclip, Plus, TreePalm, Wallet } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { fdj, today as todayIso } from "@/lib/format";
import { CONTRACT_TYPE, LEAVE_KIND, LEAVE_STATUS, currentContracts, leaveBalances } from "@/lib/rh";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { Modal } from "@/components/Modal";
import { ConfirmButton } from "@/components/ConfirmButton";
import { cancelLeave, submitLeave } from "../rh/actions";
import { LeaveForm } from "./LeaveForm";

export const dynamic = "force-dynamic";

const ERR: Record<string, string> = {
  type: "Choisissez un type de demande.",
  dates: "Vérifiez les dates : la fin doit être après le début.",
  motif: "Précisez le motif de l'absence.",
  certificat: "Le certificat médical est obligatoire pour un arrêt maladie.",
  chevauche: "Vous avez déjà une demande en cours ou validée sur ces dates.",
  jours: "Ces dates ne tombent que sur des jours de repos ou fériés.",
  taille: "Le fichier dépasse 15 Mo.",
  format: "Le justificatif doit être un PDF ou une photo.",
};
const dayFr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function MesConges({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requireUser();
  const today = todayIso();
  const requests = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.userId, user.id)).orderBy(desc(schema.leaveRequests.startDate));
  const balance = (await leaveBalances([user.id], today)).get(user.id)!;
  const contract = (await currentContracts([user.id], today)).get(user.id) ?? null;
  const pending = requests.filter((r) => r.status === "en_attente");
  const next = requests.filter((r) => r.status === "approuve" && r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const deciders = new Map((await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)).map((u) => [u.id, u.name]));

  return (
    <>
      <PageHeader
        title="Mes congés et absences"
        subtitle="Demandez un congé, déclarez un arrêt maladie et suivez vos demandes."
        actions={<Link href="/mes-conges?nouvelle=1" scroll={false} className="btn-gold"><Plus size={16} /> Nouvelle demande</Link>}
      />
      <Flash message={searchParams.ok === "envoyee" ? "Demande envoyée. Vous serez prévenu dès qu'elle sera traitée." : searchParams.ok === "annulee" ? "Demande annulée." : ""} clear={["ok"]} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Solde de congés" value={`${balance.left} j`} hint={`sur ${balance.entitled} j par an`} tone={balance.left > 0 ? "green" : "red"} icon={<TreePalm size={18} />} />
        <Stat label="Pris cette année" value={`${balance.taken} j`} hint="Congés payés validés" icon={<CalendarClock size={18} />} />
        <Stat label="En attente" value={pending.length} hint={pending.length ? "Demande(s) à valider" : "Aucune demande en cours"} tone={pending.length ? "gold" : "navy"} icon={<Hourglass size={18} />} />
        <Stat label="Prochaine absence" value={next ? dayFr(next.startDate) : "—"} hint={next ? LEAVE_KIND[next.kind]?.label : "Rien de prévu"} tone="blue" icon={<Clock size={18} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card">
          <h2 className="h-section px-5 pb-2 pt-5 sm:px-6">Mes demandes</h2>
          {requests.length === 0 ? (
            <Empty title="Aucune demande pour l'instant">
              <Link href="/mes-conges?nouvelle=1" scroll={false} className="link">Faire une demande</Link>
            </Empty>
          ) : (
            <ul className="divide-y divide-navy-100">
              {requests.map((r) => {
                const st = LEAVE_STATUS[r.status] ?? LEAVE_STATUS.en_attente;
                return (
                  <li key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-4 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-navy">{LEAVE_KIND[r.kind]?.label ?? r.kind}</span>
                        <span className={st.badge}>{st.label}</span>
                      </p>
                      <p className="mt-0.5 text-sm text-navy-700">
                        Du {dayFr(r.startDate)} au {dayFr(r.endDate)} · <b>{r.days} jour{r.days > 1 ? "s" : ""}</b> ouvré{r.days > 1 ? "s" : ""}
                      </p>
                      {r.reason && <p className="mt-1 text-sm text-navy-600/80">{r.reason}</p>}
                      {r.decisionNote && (
                        <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${r.status === "refuse" ? "bg-red-50 text-red-800" : "bg-navy-50 text-navy-700"}`}>
                          <b>{deciders.get(r.decidedBy ?? 0) ?? "Responsable"} :</b> {r.decisionNote}
                        </p>
                      )}
                      {r.docStored && <a href={`/api/fichiers/rh/demande/${r.id}`} target="_blank" className="link mt-1 inline-flex items-center gap-1 text-xs"><Paperclip size={13} /> {r.docFilename}</a>}
                    </div>
                    {r.status === "en_attente" && (
                      <form action={cancelLeave}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton className="btn-ghost btn-sm" message="Annuler cette demande ?">Annuler</ConfirmButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="card h-fit p-5">
          <h2 className="h-section mb-3 flex items-center gap-2"><BriefcaseBusiness size={15} /> Mon contrat</h2>
          {contract ? (
            <dl className="space-y-2.5 text-sm">
              {[
                ["Type", CONTRACT_TYPE[contract.contractType] ?? contract.contractType],
                ["Poste", contract.jobTitle || "—"],
                ["Depuis le", dayFr(contract.startDate)],
                ["Fin", contract.endDate ? dayFr(contract.endDate) : "Indéterminée"],
                ["Temps de travail", `${contract.weeklyHours} h / semaine`],
                ["Congés annuels", `${contract.leaveDaysPerYear} jours`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-navy-600/75">{k}</dt><dd className="text-right font-semibold text-navy">{v}</dd></div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-navy-100 pt-2.5">
                <dt className="flex items-center gap-1.5 text-navy-600/75"><Wallet size={14} /> Salaire mensuel</dt>
                <dd className="text-right text-base font-bold text-navy">{fdj(contract.monthlySalary)}</dd>
              </div>
              {contract.docStored && <a href={`/api/fichiers/rh/contrat/${contract.id}`} target="_blank" className="link inline-flex items-center gap-1 text-xs"><Paperclip size={13} /> Contrat signé</a>}
            </dl>
          ) : (
            <p className="text-sm text-navy-600/70">Aucun contrat enregistré. Votre solde est calculé sur 30 jours par an par défaut.</p>
          )}
        </aside>
      </div>

      {searchParams.nouvelle && (
        <Modal closeHref="/mes-conges" labelledBy="leave-title" width="max-w-2xl">
          <LeaveForm
            action={submitLeave}
            closeHref="/mes-conges"
            kinds={Object.entries(LEAVE_KIND).map(([key, k]) => ({ key, ...k }))}
            initial={{ kind: searchParams.type ?? "conge", start: searchParams.du ?? "", end: searchParams.au ?? "" }}
            balance={{ left: balance.left, entitled: balance.entitled }}
            error={ERR[searchParams.e ?? ""] ?? ""}
          />
        </Modal>
      )}
    </>
  );
}
