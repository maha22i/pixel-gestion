import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  AlertOctagon, ArrowLeft, CalendarRange, Check, CheckCircle2, ChevronDown, CircleDot, ExternalLink, FolderKanban, Hourglass,
  MessageSquare, Pencil, Play, Plus, RotateCcw, Send, ShieldCheck, Tag, Undo2, X,
} from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PRIORITY, TASK_STATUS, today } from "@/lib/format";
import { Avatar, TaskMark } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { Modal } from "@/components/Modal";
import { ConfirmButton, SubmitButton } from "@/components/ConfirmButton";
import { taskScope } from "@/lib/tasks";
import { addCheck, addComment, deleteTask, setStatus, toggleCheck, updateTask, validateTask } from "../actions";
import { TaskWizard } from "./TaskWizard";

type Props = { params: { id: string }; searchParams: Record<string, string | undefined> };

const FLOW = ["a_faire", "en_cours", "en_revue", "termine"] as const;
const EVENT: Record<string, string> = {
  creation: "a créé la tâche", modification: "a modifié la fiche", statut: "a changé le statut", assignation: "a changé l'équipe",
  commentaire: "a commenté", checklist: "a coché / décoché", date: "a replanifié", validation: "a validé la tâche",
  renvoi: "a renvoyé pour correction", piece: "a joint un fichier",
};
const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const when = (d: Date) => d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function TaskDetailsPage({ params, searchParams }: Props) {
  const user = await requirePerm("taches");
  const scope = taskScope(user);
  const write = scope === "write";
  const id = Number(params.id);
  if (!id) notFound();

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!task) notFound();
  const assigned = (await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, id))).map((a) => a.userId);
  if (scope === "own" && !assigned.includes(user.id)) notFound();

  const people = await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color, jobTitle: schema.users.jobTitle, active: schema.users.active })
    .from(schema.users).orderBy(asc(schema.users.name));
  const projects = (await db.execute(user.role === "admin"
    ? sql`SELECT p.id, p.title, c.name AS client FROM projects p LEFT JOIN clients c ON c.id = p.client_id ORDER BY p.id DESC`
    : sql`SELECT p.id, p.title, c.name AS client FROM projects p LEFT JOIN clients c ON c.id = p.client_id
          WHERE p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${user.id})
          ORDER BY p.id DESC`)).rows as { id: number; title: string; client: string | null }[];
  const types = await db.select({ id: schema.taskTypes.id, name: schema.taskTypes.name }).from(schema.taskTypes).orderBy(asc(schema.taskTypes.position));
  const checks = await db.select().from(schema.taskChecklistItems).where(eq(schema.taskChecklistItems.taskId, id)).orderBy(asc(schema.taskChecklistItems.position));
  const comments = await db.select().from(schema.taskComments).where(eq(schema.taskComments.taskId, id)).orderBy(asc(schema.taskComments.createdAt));
  const events = await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, id)).orderBy(desc(schema.taskEvents.createdAt));
  const [project] = task.projectId ? projects.filter((p) => p.id === task.projectId) : [];
  const [client] = !project && task.clientId ? await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, task.clientId)) : [];
  const type = types.find((t) => t.id === task.typeId);

  const backUrl = searchParams.back && searchParams.back.startsWith("/") ? searchParams.back : "/taches";
  const stayHere = `/taches/${id}${searchParams.back ? `?back=${encodeURIComponent(backUrl)}` : ""}`;
  const withParam = (k: string) => `${stayHere}${stayHere.includes("?") ? "&" : "?"}${k}`;
  const day = today();
  const person = (uid: number | null) => people.find((p) => p.id === uid);
  const team = assigned.map((uid) => person(uid)).filter(Boolean) as typeof people;
  const mine = assigned.includes(user.id);
  const canAct = write || mine;
  const done = checks.filter((c) => c.done).length;

  const start = task.startDate ? `${dayLabel(task.startDate)}${task.startTime ? ` · ${task.startTime}` : ""}` : null;
  const end = task.dueDate ? `${dayLabel(task.dueDate)}${task.dueTime ? ` · ${task.dueTime}` : ""}` : null;
  const late = !!task.dueDate && task.dueDate < day && task.status !== "termine" && task.status !== "annule";

  const statusForm = (status: string, label: React.ReactNode, cls: string, extra?: React.ReactNode) => (
    <form action={setStatus.bind(null, task.id)}>
      <input type="hidden" name={status === "finish" ? "finish" : "status"} value={status === "finish" ? "1" : status} />
      <input type="hidden" name="back" value={stayHere} />
      {extra}
      <SubmitButton className={cls}>{label}</SubmitButton>
    </form>
  );

  return (
    <div className="space-y-5">
      <Flash message={searchParams.ok === "modifiee" ? "Tâche mise à jour." : ""} clear={["ok"]} />
      <Flash
        tone="error"
        clear={["e"]}
        message={searchParams.e === "dates" ? "La date de fin doit être après la date de début." : searchParams.e === "heures" ? "L'heure de fin doit être après l'heure de début." : searchParams.e === "commentaire" ? "Expliquez ce qu'il faut corriger." : ""}
      />

      {/* En-tête */}
      <div>
        <Link href={backUrl} className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600/80 hover:text-navy"><ArrowLeft size={16} /> Retour aux tâches</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold tracking-tight text-navy sm:text-[28px]">{task.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-navy-600">
              <TaskMark status={task.status} due={task.dueDate} day={day} aside />
              {project
                ? <Link href={`/projets/${project.id}`} className="inline-flex items-center gap-1.5 hover:text-navy"><FolderKanban size={15} className="text-navy-600/60" /> {project.title}{project.client ? <span className="text-navy-600/60"> · {project.client}</span> : null}</Link>
                : <span className="inline-flex items-center gap-1.5"><FolderKanban size={15} className="text-navy-600/60" /> {client ? client.name : "Sans projet"}</span>}
              <span className="inline-flex items-center gap-1.5"><Tag size={15} className="text-navy-600/60" /> {type?.name ?? "Sans type"} · priorité {(PRIORITY[task.priority] ?? task.priority).toLowerCase()}</span>
            </div>
          </div>
          {write && <Link href={withParam("modifier=1")} scroll={false} className="btn-primary"><Pencil size={16} /> Modifier</Link>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Dates */}
          <section className="card grid divide-y divide-navy-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Play size={18} /></span>
              <div><p className="h-section">Début</p><p className="font-bold text-navy first-letter:uppercase">{start ?? "Non défini"}</p></div>
            </div>
            <div className="flex items-center gap-3 p-4">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${late ? "bg-red-50 text-red-700" : "bg-gold-100 text-amber-800"}`}><Hourglass size={18} /></span>
              <div><p className="h-section">Fin</p><p className={`font-bold first-letter:uppercase ${late ? "text-red-700" : "text-navy"}`}>{end ?? "Non définie"}{late && <span className="ml-2 text-xs">en retard</span>}</p></div>
            </div>
          </section>

          {/* Description */}
          <section className="card p-5 sm:p-6">
            <h2 className="h-section mb-2">Description</h2>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-navy-800">{task.description || <span className="text-navy-600/60">Aucune description.</span>}</p>
            {task.externalUrl && (
              <a href={task.externalUrl} target="_blank" rel="noreferrer" className="link mt-3 inline-flex items-center gap-1.5 text-sm"><ExternalLink size={14} /> Ouvrir le lien</a>
            )}
          </section>

          {/* Sous-tâches */}
          <section className="card">
            <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
              <h2 className="h-section">Sous-tâches {checks.length > 0 && <span className="ml-1 normal-case tracking-normal text-navy-600">· {done}/{checks.length}</span>}</h2>
              {(write || canAct) && (
                <Link href={withParam(write ? "modifier=1&etape=soustaches" : "soustache=1")} scroll={false} className="btn-ghost btn-sm">
                  {write ? <><Pencil size={14} /> {checks.length ? "Gérer" : "Ajouter"}</> : <><Plus size={14} /> Ajouter</>}
                </Link>
              )}
            </div>
            {checks.length > 0 && (
              <div className="mx-5 mt-2 h-1.5 overflow-hidden rounded-full bg-navy-50 sm:mx-6"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / checks.length) * 100}%` }} /></div>
            )}
            <ul className="mt-2 px-3 sm:px-4">
              {checks.map((c) => (
                <li key={c.id}>
                  <form action={toggleCheck.bind(null, c.id)}>
                    <input type="hidden" name="back" value={stayHere} />
                    <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-navy-50/60">
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${c.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-navy-200 bg-white"}`}>{c.done && <Check size={13} strokeWidth={3} />}</span>
                      <span className={c.done ? "text-navy-600/60 line-through" : "text-navy-800"}>{c.label}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            {checks.length === 0 && <p className="px-5 pb-5 pt-1 text-sm text-navy-600/60 sm:px-6">Aucune sous-tâche.</p>}
            {checks.length > 0 && <div className="pb-3" />}
          </section>

          {/* Commentaires */}
          <section className="card">
            <h2 className="flex items-center gap-2 px-5 pt-5 font-bold text-navy sm:px-6"><MessageSquare size={17} className="text-gold-600" /> Commentaires <span className="text-sm font-normal text-navy-600/60">({comments.length})</span></h2>
            <ul className="space-y-4 px-5 py-4 sm:px-6">
              {comments.length === 0 ? <li className="text-sm text-navy-600/60">Aucun commentaire pour l'instant.</li> : comments.map((c) => {
                const a = person(c.authorId);
                return (
                  <li key={c.id} className="flex gap-3">
                    <Avatar name={a?.name ?? "?"} color={a?.color} size={32} />
                    <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-navy-50/70 px-3.5 py-2.5">
                      <p className="text-xs"><b className="text-navy">{a?.name ?? "—"}</b> <span className="text-navy-600/60">· {when(c.createdAt)}</span></p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-navy-800">{c.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <form action={addComment.bind(null, task.id)} className="flex items-end gap-2 border-t border-navy-100 px-5 py-4 sm:px-6">
              <input type="hidden" name="back" value={stayHere} />
              <textarea name="body" className="input min-h-[44px]" rows={2} placeholder="Écrire un commentaire… (@Nom pour mentionner)" required />
              <SubmitButton className="btn-primary shrink-0"><Send size={15} /> Publier</SubmitButton>
            </form>
          </section>

          {/* Historique */}
          <details className="card group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
              <span className="h-section">Historique ({events.length})</span>
              <ChevronDown size={18} className="text-navy-600/50 transition group-open:rotate-180" />
            </summary>
            <ol className="space-y-2.5 border-t border-navy-100 px-5 py-4 text-sm sm:px-6">
              {events.length === 0 ? <li className="text-navy-600/60">Aucun historique.</li> : events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-navy-200" />
                  <span className="min-w-0">
                    <b className="text-navy">{person(e.actorId)?.name ?? "—"}</b> {EVENT[e.kind] ?? e.kind}
                    {e.kind === "statut" && e.detail ? <> : <b className="text-navy">{TASK_STATUS[e.detail.split(" ")[0]] ?? e.detail}</b>{e.detail.includes("—") ? ` ${e.detail.slice(e.detail.indexOf("—"))}` : ""}</> : null}
                    {(e.kind === "commentaire" || e.kind === "renvoi") && e.detail ? <span className="text-navy-600/75"> « {e.detail} »</span> : null}
                    <span className="block text-xs text-navy-600/60">{when(e.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </details>
        </div>

        {/* Colonne de droite (en premier sur téléphone : le statut est l'action principale) */}
        <aside className="order-first space-y-5 lg:order-none">
          <StatusPanel
            status={task.status}
            reason={task.blockedReason}
            canAct={canAct}
            write={write}
            statusForm={statusForm}
            validate={write && task.status === "en_revue" ? (
              <div className="space-y-2">
                <form action={validateTask.bind(null, task.id)}>
                  <input type="hidden" name="mode" value="ok" />
                  <input type="hidden" name="back" value={stayHere} />
                  <SubmitButton className="btn-primary w-full"><ShieldCheck size={16} /> Valider la tâche</SubmitButton>
                </form>
                <details className="rounded-lg border border-navy-100">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-navy-700 [&::-webkit-details-marker]:hidden"><Undo2 size={14} className="mr-1.5 inline" />Renvoyer pour correction</summary>
                  <form action={validateTask.bind(null, task.id)} className="space-y-2 px-3 pb-3">
                    <input type="hidden" name="mode" value="back" />
                    <input type="hidden" name="back" value={stayHere} />
                    <textarea name="comment" required rows={2} placeholder="Ce qu'il faut corriger" className="input" />
                    <SubmitButton className="btn-ghost w-full">Renvoyer</SubmitButton>
                  </form>
                </details>
              </div>
            ) : null}
          />

          <section className="card p-5">
            <h2 className="h-section mb-3">Équipe</h2>
            {team.length === 0 ? <p className="text-sm text-navy-600/60">Personne n'est assigné.</p> : (
              <ul className="space-y-2.5">
                {team.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Avatar name={p.name} color={p.color} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-navy">{p.name}{p.id === user.id && <span className="ml-1.5 text-xs font-normal text-navy-600/60">(vous)</span>}</span>
                      <span className="block truncate text-xs text-navy-600/65">{p.jobTitle || "—"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {write && (
            <section className="card p-5">
              <h2 className="h-section mb-2 text-red-700">Zone sensible</h2>
              <p className="mb-3 text-sm text-navy-600/75">La suppression est définitive (sous-tâches et commentaires compris).</p>
              <form action={deleteTask.bind(null, task.id)}>
                <input type="hidden" name="back" value={backUrl} />
                <ConfirmButton message={`Supprimer définitivement « ${task.title} » ?`} className="btn-danger w-full">Supprimer la tâche</ConfirmButton>
              </form>
            </section>
          )}
        </aside>
      </div>

      {!write && canAct && searchParams.soustache && (
        <Modal closeHref={stayHere} labelledBy="sub-title" width="max-w-md">
          <form action={addCheck.bind(null, task.id)}>
            <input type="hidden" name="back" value={stayHere} />
            <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-5 py-4">
              <h2 id="sub-title" className="text-lg font-bold text-navy">Ajouter une sous-tâche</h2>
              <Link href={stayHere} scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Fermer"><X size={18} /></Link>
            </div>
            <div className="p-5">
              <label htmlFor="sub-label" className="label">Intitulé</label>
              <input id="sub-label" name="label" className="input" placeholder="ex. Préparer le matériel" autoFocus required />
            </div>
            <div className="flex justify-end gap-2 border-t border-navy-100 bg-navy-50/40 px-5 py-4">
              <Link href={stayHere} scroll={false} className="btn-ghost">Annuler</Link>
              <SubmitButton>Ajouter</SubmitButton>
            </div>
          </form>
        </Modal>
      )}

      {write && searchParams.modifier && (
        <Modal closeHref={stayHere} labelledBy="task-edit-title" width="max-w-2xl">
          <TaskWizard
            initialStep={searchParams.etape}
            action={updateTask.bind(null, task.id)}
            back={stayHere}
            closeHref={stayHere}
            priorities={PRIORITY}
            projects={projects}
            types={types}
            people={people.filter((p) => p.active || assigned.includes(p.id)).map((p) => ({ id: p.id, name: p.name, color: p.color || "#2C3E50", jobTitle: p.jobTitle }))}
            task={{
              title: task.title,
              description: task.description ?? "",
              typeId: task.typeId,
              priority: task.priority,
              projectId: task.projectId,
              externalUrl: task.externalUrl ?? "",
              startDate: task.startDate ?? "",
              startTime: task.startTime ?? "",
              dueDate: task.dueDate ?? "",
              dueTime: task.dueTime ?? "",
              assignees: assigned,
              subtasks: checks.map((c) => ({ id: c.id, label: c.label, done: c.done })),
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/** Où en est la tâche, et l'action suivante adaptée. */
function StatusPanel({
  status, reason, canAct, write, statusForm, validate,
}: {
  status: string;
  reason: string | null;
  canAct: boolean;
  write: boolean;
  statusForm: (status: string, label: React.ReactNode, cls: string, extra?: React.ReactNode) => React.ReactNode;
  validate: React.ReactNode;
}) {
  const index = FLOW.indexOf(status as (typeof FLOW)[number]);
  const blocked = status === "bloque";
  return (
    <section className="card overflow-hidden">
      <div className="p-5">
        <h2 className="h-section mb-4">Avancement</h2>
        <ol className="relative space-y-3">
          <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-0.5 bg-navy-100" />
          {FLOW.map((s, i) => {
            const isDone = index > i || status === "termine";
            const current = s === status;
            return (
              <li key={s} className="relative flex items-center gap-3">
                <span className={`relative z-[1] grid h-7 w-7 place-items-center rounded-full border-2 ${
                  isDone ? "border-emerald-500 bg-emerald-500 text-white" : current ? "border-navy bg-navy text-white" : "border-navy-200 bg-white text-navy-600/40"
                }`}>
                  {isDone ? <Check size={14} strokeWidth={3} /> : <CircleDot size={13} />}
                </span>
                <span className={`text-sm ${current ? "font-bold text-navy" : isDone ? "font-semibold text-navy-700" : "text-navy-600/60"}`}>
                  {TASK_STATUS[s]}{current && s !== "termine" && <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">actuel</span>}
                </span>
              </li>
            );
          })}
        </ol>
        {blocked && (
          <div className="mt-4 flex gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <AlertOctagon size={17} className="mt-0.5 shrink-0" />
            <p><b>Tâche bloquée.</b>{reason ? ` ${reason}` : ""}</p>
          </div>
        )}
        {status === "annule" && <p className="mt-4 rounded-lg bg-navy-50 px-3 py-2.5 text-sm text-navy-700">Cette tâche est annulée.</p>}
      </div>

      {canAct && status !== "annule" && (
        <div className="space-y-2 border-t border-navy-100 bg-navy-50/40 p-5">
          {status === "a_faire" && statusForm("en_cours", <><Play size={16} /> Commencer la tâche</>, "btn-primary w-full")}

          {status === "en_cours" && (
            <>
              {statusForm("finish", <><CheckCircle2 size={16} /> Marquer comme terminée</>, "btn-gold w-full")}
              <details className="rounded-lg border border-navy-200 bg-white">
                <summary className="cursor-pointer list-none px-3 py-2 text-center text-sm font-semibold text-navy-700 [&::-webkit-details-marker]:hidden"><AlertOctagon size={14} className="mr-1.5 inline text-red-600" />Signaler un blocage</summary>
                <div className="px-3 pb-3">
                  {statusForm("bloque", "Confirmer le blocage", "btn-danger w-full", <textarea name="blockedReason" required rows={2} className="input mb-2" placeholder="Qu'est-ce qui bloque ?" />)}
                </div>
              </details>
              {statusForm("a_faire", <><RotateCcw size={14} /> Remettre à faire</>, "btn-ghost btn-sm w-full border-transparent bg-transparent text-navy-600")}
            </>
          )}

          {status === "en_revue" && (validate ?? (
            <p className="flex gap-2 text-sm text-navy-700"><Hourglass size={16} className="mt-0.5 shrink-0 text-gold-600" /> En attente de validation par un manager.</p>
          ))}

          {blocked && statusForm("en_cours", <><Play size={16} /> Reprendre la tâche</>, "btn-primary w-full")}

          {status === "termine" && (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={17} /> Tâche terminée</p>
              {(write || canAct) && statusForm("en_cours", <><RotateCcw size={14} /> Rouvrir la tâche</>, "btn-ghost btn-sm w-full")}
            </>
          )}
        </div>
      )}
      {!canAct && <p className="border-t border-navy-100 px-5 py-3 text-xs text-navy-600/70">Seules les personnes assignées peuvent changer le statut.</p>}
    </section>
  );
}
