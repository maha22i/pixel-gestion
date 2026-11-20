import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

export const ATTACH_MAX = 15 * 1024 * 1024;

export function taskScope(user: SessionUser): "none" | "own" | "read" | "write" {
  const l = user.perms.taches;
  if (l === "own" || l === "read" || l === "write") return l;
  return "none";
}

export function canEditTask(user: SessionUser) {
  return taskScope(user) === "write";
}

export async function logTask(taskId: number, actorId: number, kind: string, detail?: string) {
  await db.insert(schema.taskEvents).values({ taskId, actorId, kind, detail: detail ?? null });
}

export async function notify(userIds: number[], type: string, body: string, taskId?: number, except?: number, link?: string) {
  const ids = [...new Set(userIds.filter((id) => id && id !== except))];
  if (!ids.length) return;
  await db.insert(schema.notifications).values(ids.map((userId) => ({ userId, type, body, taskId: taskId ?? null, link: link ?? null })));
  const rows = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
  for (const u of rows) {
    const prefs = (u.notifyPrefs ?? {}) as Record<string, boolean>;
    if (!prefs[type]) continue;
    try {
      await sendMail({ to: u.email, subject: "Pixel Nomade — " + body.slice(0, 80), text: body });
    } catch {
      /* SMTP facultatif */
    }
  }
}

export async function setAssignees(taskId: number, userIds: number[]) {
  await db.delete(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, taskId));
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length) await db.insert(schema.taskAssignees).values(ids.map((userId) => ({ taskId, userId })));
}

export async function taskVisible(user: SessionUser, taskId: number) {
  const scope = taskScope(user);
  if (scope === "none") return false;
  if (scope !== "own") return true;
  const [row] = await db.select().from(schema.taskAssignees).where(and(eq(schema.taskAssignees.taskId, taskId), eq(schema.taskAssignees.userId, user.id)));
  return !!row;
}

export async function projectProgress(projectId: number) {
  const res = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status <> 'annule')::int AS total,
      COUNT(*) FILTER (WHERE status = 'termine')::int AS done
    FROM tasks WHERE project_id = ${projectId}`);
  const row = res.rows[0] as { total: number; done: number };
  const total = Number(row?.total ?? 0);
  const done = Number(row?.done ?? 0);
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

export async function saveTaskFile(file: File, taskId: number, userId: number, commentId?: number) {
  if (file.size === 0 || file.size > ATTACH_MAX) throw new Error("taille");
  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "data", "task-files");
  await fs.promises.mkdir(dir, { recursive: true });
  const storedName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.promises.writeFile(path.join(dir, storedName), buf);
  const [row] = await db.insert(schema.taskAttachments).values({
    taskId,
    commentId: commentId ?? null,
    filename: file.name || "fichier",
    storedName,
    mime: file.type || "application/octet-stream",
    size: file.size,
    uploadedBy: userId,
  }).returning();
  return row;
}

export function doneStatus(task: { personal: boolean; skipReview: boolean }, actorIsAssigneeOnly: boolean) {
  if (!actorIsAssigneeOnly) return "termine";
  if (task.personal || task.skipReview) return "termine";
  return "en_revue";
}

export async function ensureSeriesWindow(seriesId: number) {
  const [series] = await db.select().from(schema.taskSeries).where(eq(schema.taskSeries.id, seriesId));
  if (!series) return;
  const [seed] = await db.select().from(schema.tasks).where(eq(schema.tasks.seriesId, seriesId)).limit(1);
  if (!seed?.dueDate) return;
  const existing = await db.select({ d: schema.tasks.seriesDate }).from(schema.tasks).where(eq(schema.tasks.seriesId, seriesId));
  const have = new Set(existing.map((e) => e.d));
  const days = (series.weekdays ?? "").split(",").filter(Boolean).map(Number);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + (series.horizonWeeks ?? 4) * 7);
  const until = series.until ? new Date(series.until + "T00:00:00") : null;
  const assignees = await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, seed.id));
  const created: number[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (until && d > until) break;
    if (created.length + existing.length >= (series.count ?? 9999)) break;
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getDay();
    const ok = series.freq === "day" || (series.freq === "week" && days.includes(wd)) || (series.freq === "month" && d.getDate() === new Date(seed.dueDate + "T00:00:00").getDate());
    if (!ok || have.has(iso)) continue;
    const [t] = await db.insert(schema.tasks).values({
      title: seed.title,
      description: seed.description,
      projectId: seed.projectId,
      clientId: seed.clientId,
      typeId: seed.typeId,
      dueDate: iso,
      dueTime: seed.dueTime,
      priority: seed.priority,
      status: "a_faire",
      personal: seed.personal,
      skipReview: seed.skipReview,
      seriesId,
      seriesDate: iso,
      createdBy: seed.createdBy,
    }).returning({ id: schema.tasks.id });
    if (assignees.length) await db.insert(schema.taskAssignees).values(assignees.map((a) => ({ taskId: t.id, userId: a.userId })));
    created.push(t.id);
    have.add(iso);
  }
}
