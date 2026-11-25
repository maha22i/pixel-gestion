import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { CalendarDays, Crown, FileText, MapPin, Pencil, Plus, User, Users } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm, can, canFinance } from "@/lib/auth";
import { projectProgress } from "@/lib/tasks";
import { quickTasks, applyTemplate, closeProject, createTask } from "../../taches/actions";
import { invoicesFinance } from "@/lib/finance";
import { EXPENSE_CATEGORIES, PRIORITY, PROJECT_TYPES, dateFr, fdj, today } from "@/lib/format";
import { SLIP_STATUS } from "@/lib/equipmentLabels";
import { PageHeader, ProjectBadge, QuoteBadge, PayBadge, Stat, Empty, SectionCard, Avatar, TaskMark, Progress } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { displayStatus } from "@/lib/contractModel";
import { Status } from "../../contrats/Status";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ProjectForm } from "../ProjectForm";
import { deleteProject, updateProject } from "../actions";
import { CLOSED, Due, PriorityFlag, isLate } from "../bits";
import { QuickTask } from "./QuickTask";

type TaskRow = { id: number; title: string; status: string; due: string | null; people: { id: number; name: string; color: string | null }[] };

export default async function ProjectPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string; modifier?: string } }) {
  const user = await requirePerm("projets");
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  if (!p) notFound();
  const members = await db
    .select({ userId: schema.projectMembers.userId, name: schema.users.name, color: schema.users.color, jobTitle: schema.users.jobTitle })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId))
    .where(eq(schema.projectMembers.projectId, id))
    .orderBy(asc(schema.users.name));
  if (user.role !== "admin" && p.ownerId !== user.id && !members.some((m) => m.userId === user.id)) notFound();

  const write = can(user, "projets", "write");
  const editing = write && searchParams.modifier === "1";
  const interne = p.nature === "interne";
  const finance = canFinance(user) && !interne;
  const day = today();

  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name));
  const eventTypes = await db.select().from(schema.eventTypes).orderBy(asc(schema.eventTypes.position));
  const selected = await db.select().from(schema.projectEventTypes).where(eq(schema.projectEventTypes.projectId, id));
  const categories = await db.select().from(schema.projectCategories).orderBy(asc(schema.projectCategories.position));
  const people = await db.select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle, color: schema.users.color }).from(schema.users).orderBy(asc(schema.users.name));
  const client = clients.find((c) => c.id === p.clientId);
  const category = categories.find((c) => c.id === p.categoryId);
  const owner = people.find((u) => u.id === p.ownerId);

  const quotes = finance ? await db.select().from(schema.quotes).where(eq(schema.quotes.projectId, id)).orderBy(desc(schema.quotes.issueDate)) : [];
  const contracts = !interne && can(user, "contrats")
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

  const progress = await projectProgress(id);
  const taskRows = can(user, "taches")
    ? ((await db.execute(sql`
        SELECT t.id, t.title, t.status, t.due_date::text AS due,
          COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'color', u.color) ORDER BY u.name) FILTER (WHERE u.id IS NOT NULL), '[]') AS people
        FROM tasks t
        LEFT JOIN task_assignees ta ON ta.task_id = t.id
        LEFT JOIN users u ON u.id = ta.user_id
        WHERE t.project_id = ${id}
        GROUP BY t.id
        ORDER BY (t.status IN ('termine', 'annule')), t.due_date NULLS LAST, t.id`)).rows as TaskRow[])
    : [];
  const openTasks = taskRows.filter((t) => t.status !== "termine" && t.status !== "annule");
  const closedTasks = taskRows.filter((t) => t.status === "termine" || t.status === "annule");
  const lateTasks = openTasks.filter((t) => t.due && t.due < day).length;
  const templates = can(user, "taches", "write") ? await db.select().from(schema.taskTemplates) : [];
  const late = isLate(p.status, p.endDate, day);
  const closed = CLOSED.includes(p.status);
  const slips = can(user, "materiel")
    ? await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.projectId, id)).orderBy(desc(schema.equipmentSlips.outAt))
    : [];
  const events = selected
    .map((s) => ({ ...s, type: eventTypes.find((e) => e.id === s.eventTypeId) }))
    .filter((s) => s.type)
    .sort((a, b) => (a.type!.position ?? 0) - (b.type!.position ?? 0));

  // Équipe : responsable + membres, avec leurs tâches ouvertes sur ce projet.
  const team = [
    ...(owner && !members.some((m) => m.userId === owner.id) ? [{ userId: owner.id, name: owner.name, color: owner.color, jobTitle: owner.jobTitle }] : []),
    ...members,
  ].sort((a, b) => Number(b.userId === p.ownerId) - Number(a.userId === p.ownerId) || a.name.localeCompare(b.name, "fr"));
  const openFor = (uid: number) => openTasks.filter((t) => t.people.some((u) => u.id === uid)).length;

  const typeLabel = interne ? (category?.name ?? "Projet interne") : PROJECT_TYPES[p.type];

  return (
    <>
      <PageHeader
        title={p.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className={p.type === "mariage" ? "badge-gold" : interne ? "badge-navy" : "badge-gray"}>{typeLabel}</span>
            <ProjectBadge s={p.status} />
            {late && <span className="badge-red">En retard</span>}
            <PriorityFlag priority={p.priority} />
            {client && <Link href={`/clients/${client.id}`} className="link">{client.name}</Link>}
          </span>
        }
        back={editing ? { href: `/projets/${id}`, label: "Retour à la fiche" } : { href: "/projets", label: "Projets" }}
        actions={!editing && (
          <>
            {can(user, "devis", "write") && p.clientId && (
              <Link href={`/devis/nouveau?client=${p.clientId}&projet=${id}`} className="btn-primary"><Plus size={16} aria-hidden /> Devis</Link>
            )}
            {can(user, "contrats", "write") && p.clientId && (
              <Link href={`/contrats/nouveau?client=${p.clientId}&projet=${id}`} className="btn-ghost"><Plus size={16} aria-hidden /> Contrat</Link>
            )}
            {write && <Link href={`/projets/${id}?modifier=1`} className="btn-ghost"><Pencil size={15} aria-hidden /> Modifier</Link>}
          </>
        )}
      />
      <Flash message={searchParams.ok ? "Projet mis à jour." : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e === "lie" ? "Impossible de supprimer : ce projet a des factures." : ""} clear={["e"]} />

      {editing ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <ProjectForm
            action={updateProject.bind(null, id)}
            p={p}
            clients={clients}
            eventTypes={eventTypes}
            selectedEvents={selected}
            categories={categories}
            people={people}
            memberIds={members.map((m) => m.userId)}
            cancelHref={`/projets/${id}`}
          />
          <aside className="rounded-2xl border border-red-100 bg-red-50/40 p-5 xl:sticky xl:top-6">
            <p className="font-bold text-red-800">Supprimer le projet</p>
            <p className="mb-3 mt-1 text-sm text-navy-600/80">Impossible si des factures y sont rattachées. Les tâches restent dans la liste des tâches, sans projet.</p>
            <form action={deleteProject.bind(null, id)}>
              <ConfirmButton message="Supprimer ce projet ?">Supprimer le projet</ConfirmButton>
            </form>
          </aside>
        </div>
      ) : (
        <>
          {/* Vue d'ensemble */}
          <section className="card mb-6 overflow-hidden">
            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] lg:gap-8">
              <div>
                <p className="h-section mb-3">Avancement</p>
                {progress.total ? (
                  <>
                    <p className="flex items-baseline gap-2">
                      <span className="text-[2rem] font-bold leading-none tabular-nums text-navy">{progress.pct} %</span>
                      <span className="text-sm text-navy-600/75">{progress.done} tâche{progress.done > 1 ? "s" : ""} terminée{progress.done > 1 ? "s" : ""} sur {progress.total}</span>
                    </p>
                    <div className="mt-3"><Progress value={progress.pct} tone={progress.pct === 100 ? "green" : lateTasks && !closed ? "red" : "gold"} /></div>
                    {lateTasks > 0 && !closed && <p className="mt-1.5 text-xs font-bold text-red-700">{lateTasks} tâche{lateTasks > 1 ? "s" : ""} en retard</p>}
                  </>
                ) : (
                  <p className="text-sm text-navy-600/75">Aucune tâche pour l'instant. {can(user, "taches") && <a href="#taches" className="link">Ajouter des tâches</a>}</p>
                )}
                {progress.pct === 100 && write && !closed && (
                  <form action={closeProject.bind(null, id)} className="mt-4">
                    <button className="btn-gold">Clôturer : {interne ? "Publié" : "Livré"}</button>
                  </form>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-navy-100/70 pt-5 sm:grid-cols-3 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <Fact icon={<CalendarDays size={14} />} label="Échéance"><Due endIso={p.endDate} status={p.status} day={day} /></Fact>
                <Fact icon={<CalendarDays size={14} />} label="Période">
                  {p.startDate || p.endDate ? <span>{dateFr(p.startDate)} → {dateFr(p.endDate)}</span> : <span className="text-navy-600/50">Non planifié</span>}
                </Fact>
                <Fact icon={<User size={14} />} label="Responsable">
                  {owner ? <span className="flex items-center gap-2"><Avatar name={owner.name} color={owner.color} size={24} />{owner.name}</span> : <span className="text-navy-600/50">Non attribué</span>}
                </Fact>
                <Fact icon={<Users size={14} />} label={interne ? "Catégorie" : "Client"}>
                  {interne ? (category?.name ?? "—") : client ? <Link href={`/clients/${client.id}`} className="link">{client.name}</Link> : "—"}
                </Fact>
                <Fact icon={<MapPin size={14} />} label="Lieu">{p.location || <span className="text-navy-600/50">—</span>}</Fact>
                <Fact label="Priorité">{PRIORITY[p.priority] ?? p.priority}</Fact>
              </dl>
            </div>
            {(p.brief || p.notes) && (
              <div className="grid gap-4 border-t border-navy-100/70 bg-navy-50/30 px-5 py-4 sm:px-6 md:grid-cols-2">
                {p.brief && <div><p className="h-section mb-1"><FileText size={12} className="mr-1 inline" aria-hidden />Brief</p><p className="whitespace-pre-line text-sm text-navy-700">{p.brief}</p></div>}
                {p.notes && <div><p className="h-section mb-1">Notes internes</p><p className="whitespace-pre-line text-sm text-navy-700">{p.notes}</p></div>}
              </div>
            )}
          </section>

          {interne && can(user, "depenses") && (
            <div className="mb-6 max-w-xs"><Stat label="Charges" value={fdj(spent)} hint="Dépenses de Pixel Nomade sur ce projet" /></div>
          )}
          {finance && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <Stat label="Facturé" value={fdj(invoiced)} hint={`${live.length} facture${live.length > 1 ? "s" : ""}`} />
              <Stat label="Encaissé" value={fdj(paid)} tone="green" hint={invoiced ? `${Math.round((paid / invoiced) * 100)} % du facturé` : undefined} />
              <Stat label="Reste à payer" value={fdj(invoiced - paid)} tone={invoiced - paid > 0 ? "red" : "navy"} />
              {can(user, "depenses") && <Stat label="Marge (encaissé − dépenses)" value={fdj(paid - spent)} hint={`Dépenses : ${fdj(spent)}`} tone={paid - spent >= 0 ? "green" : "red"} />}
            </div>
          )}

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              {can(user, "taches") && (
                <SectionCard
                  id="taches"
                  title={`Tâches${taskRows.length ? ` · ${progress.done}/${progress.total}` : ""}`}
                  action={<Link href="/taches" className="link">Toutes les tâches</Link>}
                  flush
                >
                  {taskRows.length === 0 ? (
                    <p className="px-5 pb-4 text-sm text-navy-600/75 sm:px-6">Aucune tâche. Découpez le projet en étapes (repérage, tournage, montage…) pour suivre son avancement.</p>
                  ) : (
                    <ul className="divide-y divide-navy-100/70 border-t border-navy-100/70">
                      {openTasks.map((t) => <TaskLine key={t.id} t={t} day={day} back={`/projets/${id}`} />)}
                      {closedTasks.length > 0 && (
                        <li>
                          <details className="group">
                            <summary className="cursor-pointer list-none px-5 py-3 text-sm font-bold text-navy-600/75 hover:text-navy sm:px-6">
                              <span className="inline-block transition group-open:rotate-90" aria-hidden>›</span> {closedTasks.length} tâche{closedTasks.length > 1 ? "s" : ""} terminée{closedTasks.length > 1 ? "s" : ""} ou annulée{closedTasks.length > 1 ? "s" : ""}
                            </summary>
                            <ul className="divide-y divide-navy-100/70 border-t border-navy-100/70">
                              {closedTasks.map((t) => <TaskLine key={t.id} t={t} day={day} back={`/projets/${id}`} />)}
                            </ul>
                          </details>
                        </li>
                      )}
                    </ul>
                  )}
                  {can(user, "taches", "write") ? (
                    <div className="space-y-3 border-t border-navy-100/70 bg-navy-50/30 px-5 py-4 sm:px-6">
                      <QuickTask action={quickTasks} projectId={id} people={people} />
                      <details className="text-sm">
                        <summary className="cursor-pointer font-bold text-navy-600/80 hover:text-navy">Plus d'options : saisie multiple, modèle de tâches</summary>
                        <div className="mt-3 space-y-4">
                          <form action={quickTasks} className="space-y-2">
                            <input type="hidden" name="projectId" value={id} />
                            <label className="label" htmlFor="pt-lines">Saisie multiple · une ligne par tâche : titre | n° personne | date</label>
                            <textarea id="pt-lines" name="lines" className="input" rows={4} placeholder={"Teaser | 2 | 2026-10-28\nMontage final | | 2026-11-05"} />
                            <p className="text-xs text-navy-600/70">N° : {people.map((u) => `${u.id} = ${u.name}`).join(" · ")}. Sans n°, la tâche vous est assignée.</p>
                            <button className="btn-ghost btn-sm">Ajouter les lignes</button>
                          </form>
                          {templates.length > 0 && (
                            <form action={applyTemplate} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="projectId" value={id} />
                              <div><label className="label" htmlFor="pt-tpl">Modèle</label><select id="pt-tpl" name="templateId" className="input w-auto">{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                              <div><label className="label" htmlFor="pt-anchor">À partir du</label><input id="pt-anchor" type="date" name="anchor" className="input w-auto" defaultValue={p.startDate ?? ""} /></div>
                              <button className="btn-ghost">Appliquer le modèle</button>
                            </form>
                          )}
                        </div>
                      </details>
                    </div>
                  ) : (
                    <form action={createTask} className="flex flex-wrap gap-2 border-t border-navy-100/70 bg-navy-50/30 px-5 py-4 sm:px-6">
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="back" value={`/projets/${id}`} />
                      <input name="title" required placeholder="Nouvelle tâche pour moi" className="input min-w-0 flex-1" aria-label="Titre de la tâche" />
                      <input type="date" name="dueDate" className="input w-auto" aria-label="Échéance" />
                      <button className="btn-primary">Créer la tâche</button>
                    </form>
                  )}
                </SectionCard>
              )}

              {p.type === "mariage" && !interne && (
                <SectionCard title="Événements du mariage" action={write && <Link href={`/projets/${id}?modifier=1`} className="link">Modifier</Link>}>
                  {events.length === 0 ? <p className="text-sm text-navy-600/75">Aucun événement coché.</p> : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {events.map((e) => (
                        <li key={e.eventTypeId} className="flex items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-50/50 px-3 py-2">
                          <span className="font-bold text-navy">{e.type!.name}</span>
                          <span className="text-sm text-navy-600/75">{e.eventDate ? dateFr(e.eventDate) : "Date à fixer"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              )}

              {can(user, "materiel") && (
                <SectionCard title="Matériel sorti" action={can(user, "materiel", "write") && <Link href="/materiel/sorties/nouveau" className="btn-ghost btn-sm">Nouveau bon</Link>}>
                  {slips.length === 0 ? <p className="text-sm text-navy-600/75">Aucun bon de sortie pour ce projet.</p> : (
                    <ul className="divide-y divide-navy-100/70">
                      {slips.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <Link href={`/materiel/sorties/${s.id}`} className="link font-mono">{s.number}</Link>
                          <span className="text-navy-600/70">{dateFr(s.outAt.toISOString().slice(0, 10))} → {dateFr(s.expectedReturnAt.toISOString().slice(0, 10))}</span>
                          <span className={s.status === "cloture_anomalies" ? "badge-red" : "badge-gray"}>{SLIP_STATUS[s.status] ?? s.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              )}
            </div>

            <div className="space-y-6">
              <SectionCard title={`Équipe · ${team.length}`} action={write && <Link href={`/projets/${id}?modifier=1`} className="link">Gérer</Link>}>
                {team.length === 0 ? (
                  <p className="text-sm text-navy-600/75">Personne n'est affecté : seul l'administrateur voit ce projet.</p>
                ) : (
                  <ul className="space-y-3">
                    {team.map((m) => {
                      const n = openFor(m.userId);
                      return (
                        <li key={m.userId} className="flex items-center gap-3">
                          <Avatar name={m.name} color={m.color} size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 truncate font-bold text-navy">
                              {m.name}
                              {m.userId === p.ownerId && <span className="badge-gold"><Crown size={11} aria-hidden /> Responsable</span>}
                            </p>
                            {m.jobTitle && <p className="truncate text-xs text-navy-600/70">{m.jobTitle}</p>}
                          </div>
                          {can(user, "taches") && <span className="shrink-0 text-xs text-navy-600/70">{n ? `${n} tâche${n > 1 ? "s" : ""} en cours` : "—"}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>

              {finance && (
                <SectionCard title="Devis" flush action={can(user, "devis", "write") && p.clientId && <Link href={`/devis/nouveau?client=${p.clientId}&projet=${id}`} className="btn-ghost btn-sm">+ Devis</Link>}>
                  {quotes.length === 0 ? <p className="px-5 pb-5 text-sm text-navy-600/75 sm:px-6">Aucun devis pour ce projet.</p> : (
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
                </SectionCard>
              )}
              {!interne && can(user, "contrats") && (
                <SectionCard title="Contrats" flush action={can(user, "contrats", "write") && p.clientId && <Link href={`/contrats/nouveau?client=${p.clientId}&projet=${id}`} className="btn-ghost btn-sm">+ Contrat</Link>}>
                  {contracts.length === 0 ? <p className="px-5 pb-5 text-sm text-navy-600/75 sm:px-6">Aucun contrat pour ce projet.</p> : (
                    <table className="table"><tbody>
                      {contracts.map((ct) => (
                        <tr key={ct.id} className="clickable">
                          <td><Link href={`/contrats/${ct.id}`} className="link row-hit">{ct.number}</Link></td>
                          <td><Status s={displayStatus(ct)} /></td>
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                </SectionCard>
              )}
              {finance && (
                <SectionCard title="Factures" flush>
                  {invoices.length === 0 ? <p className="px-5 pb-5 text-sm text-navy-600/75 sm:px-6">Aucune facture. Elles se créent à partir d'un devis accepté.</p> : (
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
                </SectionCard>
              )}
              {(finance || interne) && can(user, "depenses") && (
                <SectionCard
                  title={interne ? "Charges et dépenses" : "Dépenses du projet"}
                  flush
                  action={can(user, "depenses", "write") && <Link href={`/depenses?projet=${id}`} className="btn-ghost btn-sm">+ Dépense</Link>}
                >
                  {expenses.length === 0 ? <p className="px-5 pb-5 text-sm text-navy-600/75 sm:px-6">Aucune dépense enregistrée.</p> : (
                    <table className="table"><tbody>
                      {expenses.map((e) => (
                        <tr key={e.id}>
                          <td>
                            {e.description}
                            <div className="text-sm text-navy-600/70">{EXPENSE_CATEGORIES[e.category] ?? e.category} · {dateFr(e.date)}</div>
                            {e.proofStored && <a href={`/api/fichiers/depense/${e.id}`} target="_blank" className="link text-sm font-normal">Justificatif</a>}
                          </td>
                          <td className="num">{fdj(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                </SectionCard>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Fact({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-navy-600/65">{icon}{label}</dt>
      <dd className="text-[15px] text-navy">{children}</dd>
    </div>
  );
}

function TaskLine({ t, day, back }: { t: TaskRow; day: string; back: string }) {
  const done = t.status === "termine" || t.status === "annule";
  const late = !done && !!t.due && t.due < day;
  return (
    <li className={`relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 transition hover:bg-gold/10 sm:flex-nowrap sm:px-6 ${late ? "bg-red-50/50" : ""}`}>
      <Link href={`/taches/${t.id}?back=${encodeURIComponent(back)}`} className={`min-w-0 flex-1 basis-full font-bold after:absolute after:inset-0 sm:basis-auto ${done ? "text-navy-600/55 line-through decoration-navy-200" : "text-navy"}`}>
        {t.title}
      </Link>
      <span className="flex -space-x-1.5">
        {t.people.slice(0, 3).map((u) => <span key={u.id} title={u.name}><Avatar name={u.name} color={u.color} size={24} /></span>)}
        {t.people.length > 3 && <span className="grid h-6 w-6 place-items-center rounded-full bg-navy-100 text-[10px] font-bold text-navy ring-2 ring-white">+{t.people.length - 3}</span>}
      </span>
      <span className={`w-[5.5rem] shrink-0 text-sm tabular-nums ${late ? "font-bold text-red-700" : "text-navy-600/70"}`}>{t.due ? dateFr(t.due) : "—"}</span>
      <span className="shrink-0 sm:w-[6.5rem] sm:text-right"><TaskMark status={t.status} due={t.due} day={day} /></span>
    </li>
  );
}
