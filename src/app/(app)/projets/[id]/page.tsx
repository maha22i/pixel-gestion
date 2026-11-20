import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, can, canFinance } from "@/lib/auth";
import { projectProgress } from "@/lib/tasks";
import { quickTasks, applyTemplate, closeProject, createTask } from "../../taches/actions";
import { invoicesFinance } from "@/lib/finance";
import { EXPENSE_CATEGORIES, PROJECT_TYPES, dateFr, fdj } from "@/lib/format";
import { SLIP_STATUS } from "@/lib/equipmentLabels";
import { PageHeader, ProjectBadge, QuoteBadge, PayBadge, Stat, Empty } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { displayStatus } from "@/lib/contractModel";
import { Status } from "../../contrats/Status";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ProjectForm } from "../ProjectForm";
import { deleteProject, updateProject } from "../actions";

export default async function ProjectPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string } }) {
  const user = await requirePerm("projets");
  const id = Number(params.id);
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  if (!p) notFound();
  if (user.role !== "admin") {
    const membersEarly = await db.select().from(schema.projectMembers).where(eq(schema.projectMembers.projectId, id));
    if (p.ownerId !== user.id && !membersEarly.some((m) => m.userId === user.id)) notFound();
  }
  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name));
  const eventTypes = await db.select().from(schema.eventTypes).orderBy(asc(schema.eventTypes.position));
  const selected = await db.select().from(schema.projectEventTypes).where(eq(schema.projectEventTypes.projectId, id));
  const quotes = await db.select().from(schema.quotes).where(eq(schema.quotes.projectId, id)).orderBy(desc(schema.quotes.issueDate));
  const contracts = can(user, "contrats")
    ? await db.select().from(schema.contracts).where(eq(schema.contracts.projectId, id)).orderBy(desc(schema.contracts.createdAt))
    : [];
  const invoices = await invoicesFinance(sql`i.project_id = ${id}`);
  const expenses = can(user, "depenses")
    ? await db.select().from(schema.expenses).where(eq(schema.expenses.projectId, id)).orderBy(desc(schema.expenses.date))
    : [];
  const live = invoices.filter((i) => i.status !== "annulee");
  const invoiced = live.reduce((s, i) => s + i.total, 0);
  const paid = live.reduce((s, i) => s + i.paid, 0);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const client = clients.find((c) => c.id === p.clientId);
  const write = can(user, "projets", "write");
  const interne = p.nature === "interne";
  const finance = canFinance(user) && !interne;
  const categories = await db.select().from(schema.projectCategories).orderBy(asc(schema.projectCategories.position));
  const category = categories.find((c) => c.id === p.categoryId);
  const people = await db.select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle }).from(schema.users).orderBy(asc(schema.users.name));
  const members = await db.select().from(schema.projectMembers).where(eq(schema.projectMembers.projectId, id));
  const progress = await projectProgress(id);
  const taskRows = await db.select().from(schema.tasks).where(eq(schema.tasks.projectId, id));
  const templates = await db.select().from(schema.taskTemplates);
  const late = p.endDate && p.endDate < new Date().toISOString().slice(0, 10) && !["livre", "publie", "cloture", "annule"].includes(p.status);
  const slips = can(user, "materiel")
    ? await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.projectId, id)).orderBy(desc(schema.equipmentSlips.outAt))
    : [];

  return (
    <>
      <PageHeader
        title={p.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <span className={p.type === "mariage" ? "badge-gold" : "badge-gray"}>{interne ? (category?.name ?? "Projet interne") : PROJECT_TYPES[p.type]}</span>
          <ProjectBadge s={p.status} />
          {client && <Link href={`/clients/${client.id}`} className="link">{client.name}</Link>}
          {late && <span className="badge-red">En retard</span>}
          <span className="text-sm">{progress.total ? `${progress.pct} %` : "Aucune tâche"}</span>
        </span>}
        back={{ href: "/projets", label: "Projets" }}
        actions={<span className="flex flex-wrap gap-2">
          {can(user, "devis", "write") && p.clientId && (
            <Link href={`/devis/nouveau?client=${p.clientId}&projet=${id}`} className="btn-primary">+ Devis pour ce projet</Link>
          )}
          {can(user, "contrats", "write") && p.clientId && (
            <Link href={`/contrats/nouveau?client=${p.clientId}&projet=${id}`} className="btn-ghost">+ Contrat</Link>
          )}
        </span>}
      />
      <Flash message={searchParams.ok ? "Projet mis à jour." : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e === "lie" ? "Impossible de supprimer : ce projet a des factures." : ""} clear={["e"]} />

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-navy-50"><div className="h-full bg-gold" style={{ width: `${progress.pct}%` }} /></div>
      {progress.pct === 100 && write && !["livre", "publie", "cloture", "annule"].includes(p.status) && (
        <form action={closeProject.bind(null, id)} className="mb-4">
          <button className="btn-gold">Clôturer : {p.nature === "interne" ? "Publié" : "Livré"}</button>
        </form>
      )}
      {interne && can(user, "depenses") && (
        <div className="mb-6 max-w-xs"><Stat label="Charges" value={fdj(spent)} hint="Dépenses de Pixel Nomade sur ce projet" /></div>
      )}
      {finance && (
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Stat label="Facturé" value={fdj(invoiced)} />
        <Stat label="Encaissé" value={fdj(paid)} tone="green" />
        <Stat label="Reste à payer" value={fdj(invoiced - paid)} tone={invoiced - paid > 0 ? "red" : "navy"} />
        {can(user, "depenses") && <Stat label="Marge (encaissé − dépenses)" value={fdj(paid - spent)} hint={`Dépenses : ${fdj(spent)}`} tone={paid - spent >= 0 ? "green" : "red"} />}
      </div>
      )}

      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <ProjectForm action={updateProject.bind(null, id)} p={p} clients={clients} eventTypes={eventTypes} selectedEvents={selected} disabled={!write} categories={categories} people={people} memberIds={members.map((m) => m.userId)} />
          {can(user, "taches") && (
            <section className="card card-pad space-y-3">
              <p className="h-section">Tâches du projet</p>
              {taskRows.length === 0 ? <p className="text-sm text-navy-600">Aucune tâche.</p> : taskRows.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/taches/${t.id}?back=${encodeURIComponent(`/projets/${id}`)}`} className="link">{t.title}</Link>
                  <span className="badge-gray">{t.status}</span>
                </div>
              ))}
              {can(user, "taches") && !can(user, "taches", "write") && (
                <form action={createTask} className="flex flex-wrap gap-2">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="back" value={`/projets/${id}`} />
                  <input name="title" required placeholder="Nouvelle tâche pour moi" className="input max-w-sm" />
                  <input type="date" name="dueDate" className="input w-auto" />
                  <button className="btn-primary btn-sm">Créer la tâche</button>
                </form>
              )}
              {can(user, "taches", "write") && (
                <>
                  <form action={quickTasks} className="space-y-2">
                    <input type="hidden" name="projectId" value={id} />
                    <label className="label">Saisie rapide : titre | id personne | date, une ligne par tâche</label>
                    <textarea name="lines" className="input" rows={4} placeholder={"Teaser | 2 | 2026-10-28"} />
                    <button className="btn-primary btn-sm">Ajouter les lignes</button>
                  </form>
                  <form action={applyTemplate} className="flex flex-wrap gap-2">
                    <input type="hidden" name="projectId" value={id} />
                    <select name="templateId" className="input w-auto">{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                    <input type="date" name="anchor" className="input w-auto" defaultValue={p.startDate ?? ""} />
                    <button className="btn-ghost btn-sm">Appliquer un modèle</button>
                  </form>
                </>
              )}
            </section>
          )}
          {can(user, "materiel") && (
            <section className="card card-pad space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="h-section">Matériel sorti</p>
                {can(user, "materiel", "write") && <Link href={`/materiel/sorties/nouveau`} className="btn-ghost btn-sm">Nouveau bon</Link>}
              </div>
              {slips.length === 0 ? <p className="text-sm text-navy-600/80">Aucun bon de sortie pour ce projet.</p> : slips.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link href={`/materiel/sorties/${s.id}`} className="link font-mono">{s.number}</Link>
                  <span className="text-navy-600/70">{dateFr(s.outAt.toISOString().slice(0, 10))} → {dateFr(s.expectedReturnAt.toISOString().slice(0, 10))}</span>
                  <span className={s.status === "cloture_anomalies" ? "badge-red" : "badge-gray"}>{SLIP_STATUS[s.status] ?? s.status}</span>
                </div>
              ))}
            </section>
          )}
          {write && (
            <form action={deleteProject.bind(null, id)}>
              <ConfirmButton message="Supprimer ce projet ?">Supprimer le projet</ConfirmButton>
            </form>
          )}
        </div>
        <div className="space-y-6">
          {finance && <section className="card">
            <p className="h-section px-5 pt-5 pb-2">Devis</p>
            {quotes.length === 0 ? <Empty title="Aucun devis" /> : (
              <table className="table"><tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="clickable">
                    <td><Link href={`/devis/${q.id}`} className="link row-hit">{q.number}</Link><div className="text-sm text-navy-600/70">{dateFr(q.issueDate)}</div></td>
                    <td className="num">{fdj(q.total)}</td>
                    <td><QuoteBadge s={q.status} /></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </section>}
          {!interne && can(user, "contrats") && (
            <section className="card">
              <p className="h-section px-5 pt-5 pb-2">Contrats</p>
              {contracts.length === 0 ? <Empty title="Aucun contrat" /> : (
                <table className="table"><tbody>
                  {contracts.map((ct) => (
                    <tr key={ct.id} className="clickable">
                      <td><Link href={`/contrats/${ct.id}`} className="link row-hit">{ct.number}</Link></td>
                      <td><Status s={displayStatus(ct)} /></td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </section>
          )}
          {finance && <section className="card">
            <p className="h-section px-5 pt-5 pb-2">Factures</p>
            {invoices.length === 0 ? <Empty title="Aucune facture" /> : (
              <table className="table"><tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="clickable">
                    <td><Link href={`/factures/${i.id}`} className="link row-hit">{i.number}</Link><div className="text-sm text-navy-600/70">{dateFr(i.issueDate)}</div></td>
                    <td className="num">{fdj(i.total)}<div className="text-sm text-navy-600/70">payé {fdj(i.paid)}</div></td>
                    <td><PayBadge s={i.paymentStatus} overdue={i.overdue} /></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </section>}
          {(finance || interne) && can(user, "depenses") && (
            <section className="card">
              <div className="flex items-center justify-between px-5 pt-5 pb-2">
                <p className="h-section">{interne ? "Charges et dépenses" : "Dépenses du projet"}</p>
                {can(user, "depenses", "write") && <Link href={`/depenses?projet=${id}`} className="btn-ghost btn-sm">+ Dépense</Link>}
              </div>
              {expenses.length === 0 ? <Empty title="Aucune dépense" /> : (
                <table className="table"><tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {e.description}
                        <div className="text-sm text-navy-600/70">{EXPENSE_CATEGORIES[e.category] ?? e.category} · {dateFr(e.date)}</div>
                        {e.proofStored && <a href={`/api/fichiers/depense/${e.id}`} target="_blank" className="text-sm link font-normal">Justificatif</a>}
                      </td>
                      <td className="num">{fdj(e.amount)}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
