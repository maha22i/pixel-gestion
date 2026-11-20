"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { addDays, today } from "@/lib/format";
import { canEditTask, doneStatus, ensureSeriesWindow, logTask, notify, saveTaskFile, setAssignees, taskScope, taskVisible } from "@/lib/tasks";

function ids(fd: FormData, key: string) {
  return fd.getAll(key).map(Number).filter(Boolean);
}

async function guard(taskId: number) {
  const user = await requirePerm("taches");
  if (!(await taskVisible(user, taskId))) redirect("/acces-refuse");
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!task) redirect("/taches");
  return { user, task };
}

export async function createTask(fd: FormData) {
  const user = await requirePerm("taches");
  const scope = taskScope(user);
  const title = String(fd.get("title") ?? "").trim();
  if (!title) redirect("/taches?e=titre");
  let assigneeIds = user.role === "admin" ? ids(fd, "assignees") : [user.id];
  if (!assigneeIds.length) assigneeIds = [user.id];
  const projectId = Number(fd.get("projectId")) || null;
  let clientId = Number(fd.get("clientId")) || null;
  if (projectId) {
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    if (p?.clientId) clientId = p.clientId;
  }
  const [t] = await db.insert(schema.tasks).values({
    title,
    description: String(fd.get("description") ?? "") || null,
    projectId,
    clientId,
    typeId: Number(fd.get("typeId")) || null,
    startDate: String(fd.get("startDate") ?? "") || null,
    dueDate: String(fd.get("dueDate") ?? "") || null,
    dueTime: String(fd.get("dueTime") ?? "") || null,
    priority: String(fd.get("priority") ?? "normale"),
    status: "a_faire",
    externalUrl: String(fd.get("externalUrl") ?? "") || null,
    personal: scope !== "write" && !projectId ? true : fd.get("personal") === "on",
    skipReview: fd.get("skipReview") === "on",
    createdBy: user.id,
  }).returning();
  await setAssignees(t.id, assigneeIds);
  const checks = String(fd.get("checklist") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (checks.length) {
    await db.insert(schema.taskChecklistItems).values(checks.map((label, i) => ({ taskId: t.id, label, position: i })));
  }
  await logTask(t.id, user.id, "creation", title);
  await notify(assigneeIds, "assign", `${user.name} vous a assigné « ${title} »`, t.id, user.id);
  revalidatePath("/taches");
  revalidatePath("/ma-journee");
  const back = String(fd.get("back") ?? "");
  redirect(back || `/taches/${t.id}`);
}

export async function quickTasks(fd: FormData) {
  const user = await requirePerm("taches", "write");
  const projectId = Number(fd.get("projectId")) || null;
  let clientId: number | null = null;
  if (projectId) {
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    clientId = p?.clientId ?? null;
  }
  const lines = String(fd.get("lines") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [title, who, date] = line.split("|").map((s) => s.trim());
    if (!title) continue;
    const assignee = Number(who) || user.id;
    const [t] = await db.insert(schema.tasks).values({
      title, projectId, clientId, dueDate: date || null, createdBy: user.id, priority: "normale", status: "a_faire",
    }).returning();
    await setAssignees(t.id, [assignee]);
    await logTask(t.id, user.id, "creation", "Saisie rapide");
    await notify([assignee], "assign", `${user.name} vous a assigné « ${title} »`, t.id, user.id);
  }
  revalidatePath("/projets");
  redirect(projectId ? `/projets/${projectId}?ok=1` : "/taches");
}

export async function updateTask(id: number, fd: FormData) {
  const { user, task } = await guard(id);
  const write = canEditTask(user);
  if (!write) redirect("/acces-refuse");
  const title = String(fd.get("title") ?? "").trim() || task.title;
  const patch = {
    title,
    description: String(fd.get("description") ?? "") || null,
    projectId: Number(fd.get("projectId")) || null,
    clientId: Number(fd.get("clientId")) || null,
    typeId: Number(fd.get("typeId")) || null,
    startDate: String(fd.get("startDate") ?? "") || null,
    dueDate: String(fd.get("dueDate") ?? "") || null,
    dueTime: String(fd.get("dueTime") ?? "") || null,
    priority: String(fd.get("priority") ?? task.priority),
    externalUrl: String(fd.get("externalUrl") ?? "") || null,
    skipReview: write ? fd.get("skipReview") === "on" : task.skipReview,
  };
  await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, id));
  if (write) {
    const next = ids(fd, "assignees");
    if (next.length) {
      await setAssignees(id, next);
      await logTask(id, user.id, "assignation", next.join(","));
      await notify(next, "assign", `${user.name} a mis à jour l'assignation de « ${title} »`, id, user.id);
    }
  }
  await logTask(id, user.id, "modification", "Fiche mise à jour");
  revalidatePath("/taches");
  redirect(String(fd.get("back") ?? "") || `/taches/${id}`);
}

export async function setStatus(id: number, fd: FormData) {
  const { user, task } = await guard(id);
  let status = String(fd.get("status") ?? "");
  const reason = String(fd.get("blockedReason") ?? "").trim();
  const assignees = await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, id));
  const mine = assignees.some((a) => a.userId === user.id);
  if (!canEditTask(user) && !mine) redirect("/acces-refuse");
  if (fd.get("finish") === "1") status = "termine";
  else if (status === "termine" || fd.get("done") === "1") {
    status = doneStatus(task, !canEditTask(user) || fd.get("done") === "1");
    if (canEditTask(user) && fd.get("force") === "1") status = "termine";
  }
  if (!["a_faire", "en_cours", "en_revue", "termine", "bloque", "annule"].includes(status)) status = task.status;
  await db.update(schema.tasks).set({ status, blockedReason: status === "bloque" ? reason || task.blockedReason : null }).where(eq(schema.tasks.id, id));
  await logTask(id, user.id, "statut", status + (reason ? ` — ${reason}` : ""));
  const managers = (await db.select().from(schema.users)).filter((u) => u.role === "manager" || u.role === "admin").map((u) => u.id);
  if (status === "en_revue") await notify(managers, "review", `« ${task.title} » est à valider`, id, user.id);
  if (status === "bloque") await notify(managers, "blocked", `« ${task.title} » est bloquée${reason ? " : " + reason : ""}`, id, user.id);
  revalidatePath("/taches");
  revalidatePath("/ma-journee");
  redirect(String(fd.get("back") ?? "") || `/taches/${id}`);
}

export async function validateTask(id: number, fd: FormData) {
  const user = await requirePerm("taches", "write");
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!task) redirect("/taches");
  const mode = String(fd.get("mode") ?? "ok");
  const comment = String(fd.get("comment") ?? "").trim();
  const assignees = (await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, id))).map((a) => a.userId);
  if (mode === "back") {
    if (!comment) redirect(`/taches/${id}?e=commentaire`);
    await db.update(schema.tasks).set({ status: "en_cours" }).where(eq(schema.tasks.id, id));
    await db.insert(schema.taskComments).values({ taskId: id, authorId: user.id, body: comment });
    await logTask(id, user.id, "renvoi", comment);
    await notify(assignees, "review", `${user.name} a renvoyé « ${task.title} » : ${comment}`, id, user.id);
  } else {
    await db.update(schema.tasks).set({ status: "termine" }).where(eq(schema.tasks.id, id));
    await logTask(id, user.id, "validation", "Terminé");
    await notify(assignees, "review", `${user.name} a validé « ${task.title} »`, id, user.id);
  }
  revalidatePath("/taches");
  redirect(String(fd.get("back") ?? "/taches?filtre=revue"));
}

export async function deleteTask(id: number) {
  const { user, task } = await guard(id);
  if (!canEditTask(user)) redirect("/acces-refuse");
  if (task.createdBy && task.createdBy !== user.id && user.role === "technician") redirect("/acces-refuse");
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  revalidatePath("/taches");
  redirect("/taches");
}

export async function addComment(id: number, fd: FormData) {
  const { user, task } = await guard(id);
  const body = String(fd.get("body") ?? "").trim();
  if (!body && !(fd.get("file") instanceof File)) redirect(String(fd.get("back") ?? "") || `/taches/${id}`);
  const [c] = await db.insert(schema.taskComments).values({ taskId: id, authorId: user.id, body: body || "(pièce jointe)" }).returning();
  const file = fd.get("file");
  if (file instanceof File && file.size) {
    await saveTaskFile(file, id, user.id, c.id);
    await logTask(id, user.id, "piece", file.name);
  }
  await logTask(id, user.id, "commentaire", body.slice(0, 140));
  const people = await db.select().from(schema.users);
  const mentioned = people.filter((p) => body.toLowerCase().includes("@" + p.name.toLowerCase())).map((p) => p.id);
  const assignees = (await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, id))).map((a) => a.userId);
  await notify(mentioned, "mention", `${user.name} vous mentionne sur « ${task.title} »`, id, user.id);
  await notify([...assignees, task.createdBy ?? 0], "comment", `${user.name} a commenté « ${task.title} »`, id, user.id);
  revalidatePath("/taches");
  redirect(String(fd.get("back") ?? "") || `/taches/${id}`);
}

export async function toggleCheck(itemId: number, fd: FormData) {
  const user = await requireUser();
  const [item] = await db.select().from(schema.taskChecklistItems).where(eq(schema.taskChecklistItems.id, itemId));
  if (!item || !(await taskVisible(user, item.taskId))) redirect("/acces-refuse");
  await db.update(schema.taskChecklistItems).set({ done: !item.done }).where(eq(schema.taskChecklistItems.id, itemId));
  await logTask(item.taskId, user.id, "checklist", item.label);
  revalidatePath("/taches");
  redirect(String(fd.get("back") ?? "") || `/taches/${item.taskId}`);
}

export async function addCheck(taskId: number, fd: FormData) {
  const { user } = await guard(taskId);
  const label = String(fd.get("label") ?? "").trim();
  if (label) {
    await db.insert(schema.taskChecklistItems).values({ taskId, label });
    await logTask(taskId, user.id, "checklist", "Ajout : " + label);
  }
  redirect(String(fd.get("back") ?? "") || `/taches/${taskId}`);
}

export async function attachFile(taskId: number, fd: FormData) {
  const { user } = await guard(taskId);
  const file = fd.get("file");
  if (file instanceof File && file.size) {
    try {
      await saveTaskFile(file, taskId, user.id);
      await logTask(taskId, user.id, "piece", file.name);
    } catch {
      redirect(String(fd.get("back") ?? "") || `/taches/${taskId}?e=fichier`);
    }
  }
  redirect(String(fd.get("back") ?? "") || `/taches/${taskId}`);
}

export async function moveTask(fd: FormData) {
  const user = await requirePerm("planning");
  const id = Number(fd.get("id"));
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!task) redirect("/planning");
  const due = String(fd.get("dueDate") ?? "") || null;
  const userId = Number(fd.get("userId")) || null;
  const status = String(fd.get("status") ?? "");
  const mine = await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, id));
  const isMine = mine.some((a) => a.userId === user.id);
  const write = canEditTask(user) || user.perms.planning === "write";
  if (!write && !(isMine && task.personal)) redirect("/acces-refuse");
  if (fd.get("unset") === "1" && write) {
    await db.update(schema.tasks).set({ dueDate: null, dueTime: null }).where(eq(schema.tasks.id, id));
    await setAssignees(id, []);
    await logTask(id, user.id, "date", "Retirée du planning");
  }
  const dueTime = String(fd.get("dueTime") ?? "");
  if (fd.get("unset") !== "1" && (due || dueTime)) {
    await db.update(schema.tasks).set({
      ...(due ? { dueDate: due } : {}),
      ...(dueTime ? { dueTime } : {}),
    }).where(eq(schema.tasks.id, id));
    await logTask(id, user.id, "date", `${due ?? ""} ${dueTime}`.trim());
  }
  if (userId && write) {
    await setAssignees(id, [userId]);
    await logTask(id, user.id, "assignation", String(userId));
    await notify([userId], "assign", `${user.name} vous a réassigné « ${task.title} »`, id, user.id);
  }
  if (status && ["a_faire", "en_cours", "en_revue", "termine", "bloque"].includes(status)) {
    await db.update(schema.tasks).set({ status }).where(eq(schema.tasks.id, id));
    await logTask(id, user.id, "statut", status);
  }
  revalidatePath("/planning");
  revalidatePath("/taches");
  if (fd.get("ajax") === "1") return;
  redirect(String(fd.get("back") ?? "/planning"));
}

export async function addTime(taskId: number, fd: FormData) {
  const { user } = await guard(taskId);
  const hours = Number(fd.get("hours") ?? 0);
  const minutes = Number(fd.get("minutes") ?? 0) + Math.round(hours * 60);
  if (minutes > 0) {
    await db.insert(schema.taskTimeEntries).values({ taskId, userId: user.id, minutes, note: String(fd.get("note") ?? "") || null });
    await logTask(taskId, user.id, "temps", `${minutes} min`);
  }
  redirect(String(fd.get("back") ?? "") || `/taches/${taskId}`);
}

export async function createSeries(fd: FormData) {
  const user = await requirePerm("taches", "write");
  const title = String(fd.get("title") ?? "").trim();
  if (!title) redirect("/taches?e=titre");
  const freq = String(fd.get("freq") ?? "week");
  const weekdays = fd.getAll("weekdays").map(String).join(",");
  const [series] = await db.insert(schema.taskSeries).values({
    freq,
    weekdays: weekdays || null,
    until: String(fd.get("until") ?? "") || null,
    count: Number(fd.get("count")) || null,
    horizonWeeks: 4,
  }).returning();
  const assignee = Number(fd.get("assignee")) || user.id;
  const [t] = await db.insert(schema.tasks).values({
    title,
    description: String(fd.get("description") ?? "") || null,
    projectId: Number(fd.get("projectId")) || null,
    dueDate: String(fd.get("dueDate") ?? "") || today(),
    priority: "normale",
    seriesId: series.id,
    seriesDate: String(fd.get("dueDate") ?? "") || today(),
    createdBy: user.id,
  }).returning();
  await setAssignees(t.id, [assignee]);
  await ensureSeriesWindow(series.id);
  revalidatePath("/taches");
  redirect("/taches");
}

export async function saveTemplate(fd: FormData) {
  await requirePerm("taches", "write");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) redirect("/taches/modeles");
  const [tpl] = await db.insert(schema.taskTemplates).values({ name, description: String(fd.get("description") ?? "") || null }).returning();
  const titles = fd.getAll("itemTitle").map(String);
  const offsets = fd.getAll("offset").map((v) => Number(v) || 0);
  const rows = titles.map((title, i) => ({ templateId: tpl.id, title: title.trim(), offsetDays: offsets[i] ?? 0, position: i })).filter((r) => r.title);
  if (rows.length) await db.insert(schema.taskTemplateItems).values(rows);
  redirect("/taches/modeles");
}

export async function applyTemplate(fd: FormData) {
  const user = await requirePerm("taches", "write");
  const projectId = Number(fd.get("projectId"));
  const templateId = Number(fd.get("templateId"));
  const anchor = String(fd.get("anchor") ?? "") || today();
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) redirect("/projets");
  const items = await db.select().from(schema.taskTemplateItems).where(eq(schema.taskTemplateItems.templateId, templateId));
  const people = await db.select().from(schema.users);
  for (const item of items) {
    const due = addDays(anchor, item.offsetDays);
    const match = item.jobTitle ? people.find((p) => (p.jobTitle ?? "").toLowerCase().includes(item.jobTitle!.toLowerCase())) : undefined;
    const [t] = await db.insert(schema.tasks).values({
      title: item.title,
      projectId,
      clientId: project.clientId,
      typeId: item.typeId,
      dueDate: due,
      priority: item.priority,
      createdBy: user.id,
    }).returning();
    await setAssignees(t.id, [match?.id ?? user.id]);
    await logTask(t.id, user.id, "creation", "Modèle");
  }
  revalidatePath(`/projets/${projectId}`);
  redirect(`/projets/${projectId}?ok=1`);
}

export async function closeProject(id: number) {
  const user = await requirePerm("projets", "write");
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  if (!p) redirect("/projets");
  const status = p.nature === "interne" ? "publie" : "livre";
  await db.update(schema.projects).set({ status }).where(eq(schema.projects.id, id));
  revalidatePath(`/projets/${id}`);
  redirect(`/projets/${id}?ok=1`);
}

export async function markNotificationsRead(fd: FormData) {
  const user = await requireUser();
  const id = Number(fd.get("id"));
  let link = String(fd.get("link") ?? "").trim();
  if (id) {
    const [n] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
    if (n?.link) link = n.link;
    await db.update(schema.notifications).set({ readAt: new Date() }).where(eq(schema.notifications.id, id));
  } else await db.update(schema.notifications).set({ readAt: new Date() }).where(eq(schema.notifications.userId, user.id));
  const task = Number(fd.get("taskId"));
  revalidatePath("/");
  if (link.startsWith("/")) redirect(link);
  redirect(task ? `/taches/${task}` : "/notifications");
}

export async function saveCategory(fd: FormData) {
  await requireUser();
  const { requireAdmin } = await import("@/lib/auth");
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  if (name) await db.insert(schema.projectCategories).values({ name });
  redirect("/parametres");
}

export async function saveTaskType(fd: FormData) {
  const { requireAdmin } = await import("@/lib/auth");
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  if (name) await db.insert(schema.taskTypes).values({ name });
  redirect("/parametres");
}

void inArray;
