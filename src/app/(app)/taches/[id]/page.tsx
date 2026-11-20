import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PRIORITY, dateFr, taskSignal, today } from "@/lib/format";
import { TaskMark } from "@/components/ui";
import { taskScope } from "@/lib/tasks";
import { addCheck, addComment, addTime, attachFile, deleteTask, setStatus, toggleCheck, updateTask, validateTask } from "../actions";

type Props = {
  params: { id: string };
  searchParams: Record<string, string | undefined>;
};

export default async function TaskDetailsPage({ params, searchParams }: Props) {
  const user = await requirePerm("taches");
  const scope = taskScope(user);
  const write = scope === "write";
  const id = Number(params.id);
  if (!id) notFound();

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!task) notFound();

  if (scope === "own") {
    const mine = await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, id));
    if (!mine.some((a) => a.userId === user.id)) notFound();
  }

  const people = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const projects = user.role === "admin"
    ? await db.select().from(schema.projects).orderBy(desc(schema.projects.id))
    : (await db.execute(sql`
        SELECT p.* FROM projects p
        WHERE p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${user.id})
        ORDER BY p.id DESC`)).rows as any[];
  const types = await db.select().from(schema.taskTypes).orderBy(asc(schema.taskTypes.position));
  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name));
  const checks = await db.select().from(schema.taskChecklistItems).where(eq(schema.taskChecklistItems.taskId, id)).orderBy(asc(schema.taskChecklistItems.position));
  const comments = await db.select().from(schema.taskComments).where(eq(schema.taskComments.taskId, id)).orderBy(asc(schema.taskComments.createdAt));
  const events = await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, id)).orderBy(desc(schema.taskEvents.createdAt));
  const files = await db.select().from(schema.taskAttachments).where(eq(schema.taskAttachments.taskId, id));
  const assigned = (await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, id))).map((a) => a.userId);
  const minutes = Number(((await db.execute(sql`SELECT COALESCE(SUM(minutes),0)::int AS m FROM task_time_entries WHERE task_id = ${id}`)).rows[0] as any).m);
  const backUrl = searchParams.back && searchParams.back.startsWith("/") ? searchParams.back : "/taches";
  const stayHere = `/taches/${id}${searchParams.back ? `?back=${encodeURIComponent(backUrl)}` : ""}`;
  const assigneesLabel = assigned.length
    ? assigned.map((uid) => people.find((p) => p.id === uid)?.name).filter(Boolean).join(", ")
    : "Non assignée";
  const day = today();
  const signal = taskSignal(task.status, task.dueDate, day);
  const dueLabel = task.dueDate ? `${dateFr(task.dueDate)}${task.dueTime ? ` à ${task.dueTime}` : ""}` : "Non planifiée";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Fiche tâche</h1>
        <Link href={backUrl} className="btn-ghost btn-sm">Retour à la liste</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="card card-pad space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl font-bold text-navy">{task.title}</p>
              <TaskMark status={task.status} due={task.dueDate} day={day} aside />
            </div>
            <div className="grid gap-2 text-sm text-navy-700 sm:grid-cols-2">
              <p><b>Assignée à :</b> {assigneesLabel}</p>
              <p><b>Échéance :</b> <span className={signal.date}>{dueLabel}</span></p>
              <p><b>Priorité :</b> {PRIORITY[task.priority] ?? task.priority}</p>
              <p><b>Temps saisi :</b> {minutes} min</p>
            </div>
          </section>

          <section className="card card-pad">
            <p className="mb-3 font-bold text-navy">Informations de la tâche</p>
            {write ? (
              <form action={updateTask.bind(null, task.id)} className="space-y-3">
                <input type="hidden" name="back" value={stayHere} />
                <div>
                  <label className="label">Titre</label>
                  <input name="title" className="input" defaultValue={task.title} />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea name="description" className="input" rows={5} defaultValue={task.description ?? ""} placeholder="Détails, consignes, liens utiles..." />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div><label className="label">Projet</label><select name="projectId" className="input" defaultValue={task.projectId ?? ""}><option value="">Sans projet</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
                  <div><label className="label">Client</label><select name="clientId" className="input" defaultValue={task.clientId ?? ""}><option value="">Client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label className="label">Type</label><select name="typeId" className="input" defaultValue={task.typeId ?? ""}><option value="">Type</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                  <div><label className="label">Priorité</label><select name="priority" className="input" defaultValue={task.priority}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><label className="label">Date limite</label><input type="date" name="dueDate" className="input" defaultValue={task.dueDate?.slice?.(0, 10) ?? task.dueDate ?? ""} /></div>
                  <div><label className="label">Heure limite</label><input type="time" name="dueTime" className="input" defaultValue={task.dueTime ?? ""} /></div>
                </div>
                <div>
                  <label className="label">Lien externe</label>
                  <input name="externalUrl" className="input" placeholder="https://..." defaultValue={task.externalUrl ?? ""} />
                </div>
                <div>
                  <p className="label">Personnes assignées</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                    {people.map((p) => (
                      <label key={p.id} className="text-sm"><input type="checkbox" name="assignees" value={p.id} defaultChecked={assigned.includes(p.id)} /> {p.name}</label>
                    ))}
                  </div>
                </div>
                <label className="block text-sm"><input type="checkbox" name="skipReview" defaultChecked={task.skipReview} /> Validation manager non requise</label>
                <button className="btn-primary">Enregistrer les modifications</button>
              </form>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-navy-700">{task.description || "Aucune description."}</p>
            )}
          </section>

          <section className="card card-pad">
            <p className="mb-3 font-bold text-navy">Checklist / Sous-tâches</p>
            {checks.length === 0 && <p className="mb-3 text-sm text-navy-600">Aucune sous-tâche pour le moment.</p>}
            <div className="space-y-1">
              {checks.map((c) => (
                <form key={c.id} action={toggleCheck.bind(null, c.id)}>
                  <input type="hidden" name="back" value={stayHere} />
                  <button className="text-left text-sm hover:text-gold">{c.done ? "☑" : "☐"} {c.label}</button>
                </form>
              ))}
            </div>
            <form action={addCheck.bind(null, task.id)} className="mt-3 flex gap-2">
              <input type="hidden" name="back" value={stayHere} />
              <input name="label" className="input" placeholder="Nouvelle sous-tâche" />
              <button className="btn-ghost btn-sm">Ajouter</button>
            </form>
          </section>

          <section className="card card-pad">
            <p className="mb-3 font-bold text-navy">Commentaires</p>
            <form action={addComment.bind(null, task.id)} className="space-y-2">
              <textarea name="body" className="input" placeholder="Écrire un commentaire et @mentionner une personne..." />
              <input type="file" name="file" accept="image/*,video/*,.pdf,.doc,.docx" className="input" />
              <input type="hidden" name="back" value={stayHere} />
              <button className="btn-ghost btn-sm">Publier le commentaire</button>
            </form>
            <ul className="mt-3 space-y-2 text-sm">
              {comments.length === 0 ? <li className="text-navy-600">Aucun commentaire.</li> : comments.map((c) => <li key={c.id}><b>{people.find((p) => p.id === c.authorId)?.name}</b> · {c.body}</li>)}
            </ul>
          </section>

          <section className="card card-pad">
            <p className="mb-3 font-bold text-navy">Fichiers</p>
            <form action={attachFile.bind(null, task.id)} className="space-y-2">
              <input type="file" name="file" className="input" />
              <input type="hidden" name="back" value={stayHere} />
              <button className="btn-ghost btn-sm">Joindre le fichier (15 Mo max)</button>
            </form>
            <ul className="mt-3 text-sm">
              {files.length === 0 ? <li className="text-navy-600">Aucun fichier joint.</li> : files.map((f) => <li key={f.id}><a className="link" href={`/api/fichiers/tache/${f.id}`}>{f.filename}</a></li>)}
            </ul>
          </section>

          <section className="card card-pad">
            <p className="mb-3 font-bold text-navy">Historique</p>
            <div className="space-y-1 text-xs text-navy-600/80">
              {events.length === 0 ? <p>Aucun historique.</p> : events.map((e) => <p key={e.id}>{new Date(e.createdAt).toLocaleString("fr-FR")} · {people.find((p) => p.id === e.actorId)?.name} · {e.kind} {e.detail ?? ""}</p>)}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="card card-pad space-y-3">
            <p className="font-bold text-navy">Actions de statut</p>
            <form action={setStatus.bind(null, task.id)}>
              <input type="hidden" name="status" value="en_cours" />
              <input type="hidden" name="back" value={stayHere} />
              <button className="btn-ghost btn-sm w-full">Passer en cours</button>
            </form>
            <form action={setStatus.bind(null, task.id)}>
              <input type="hidden" name="status" value="a_faire" />
              <input type="hidden" name="back" value={stayHere} />
              <button className="btn-ghost btn-sm w-full">Remettre à faire</button>
            </form>
            <form action={setStatus.bind(null, task.id)}>
              <input type="hidden" name="finish" value="1" />
              <input type="hidden" name="back" value={stayHere} />
              <button className="btn-gold w-full">Terminer cette tâche</button>
            </form>
            <p className="text-xs text-navy-600">Le bouton “Terminer cette tâche” marque la tâche comme terminée immédiatement.</p>
          </section>

          {write && task.status === "en_revue" && (
            <section className="card card-pad space-y-3">
              <p className="font-bold text-navy">Validation manager</p>
              <form action={validateTask.bind(null, task.id)}>
                <input type="hidden" name="mode" value="ok" />
                <input type="hidden" name="back" value={stayHere} />
                <button className="btn-primary btn-sm w-full">Valider définitivement</button>
              </form>
              <form action={validateTask.bind(null, task.id)} className="space-y-2">
                <input type="hidden" name="mode" value="back" />
                <input type="hidden" name="back" value={stayHere} />
                <input name="comment" required placeholder="Ce qu'il faut corriger" className="input" />
                <button className="btn-ghost btn-sm w-full">Renvoyer pour correction</button>
              </form>
            </section>
          )}

          <section className="card card-pad space-y-3">
            <p className="font-bold text-navy">Temps passé</p>
            <form action={addTime.bind(null, task.id)} className="space-y-2">
              <input name="hours" type="number" min="0" step="0.5" placeholder="Heures (ex: 1.5)" className="input" />
              <input type="hidden" name="back" value={stayHere} />
              <button className="btn-ghost btn-sm w-full">Ajouter le temps</button>
            </form>
          </section>

          {write && (
            <section className="card card-pad">
              <p className="mb-2 font-bold text-red-700">Zone sensible</p>
              <form action={deleteTask.bind(null, task.id)}>
                <input type="hidden" name="back" value={backUrl} />
                <button className="btn-danger btn-sm w-full">Supprimer la tâche</button>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
