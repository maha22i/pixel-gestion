"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { INTERNAL_STATUS, PRIORITY, PROJECT_STATUS, PROJECT_TYPES } from "@/lib/format";

function values(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const nature = s("nature") === "interne" ? "interne" : "client";
  const type = nature === "interne" ? "autonome" : s("type");
  const status = s("status");
  const clientId = nature === "interne" ? null : (Number(s("clientId")) || null);
  const priority = s("priority");
  return {
    clientId,
    title: s("title") || "Projet sans titre",
    type: type in PROJECT_TYPES ? type : "prive",
    nature,
    categoryId: nature === "interne" ? (Number(s("categoryId")) || null) : null,
    ownerId: Number(s("ownerId")) || null,
    priority: priority in PRIORITY ? priority : "normale",
    brief: s("brief") || null,
    status: nature === "interne"
      ? (status in INTERNAL_STATUS ? status : "en_cours")
      : (status in PROJECT_STATUS && status !== "publie" ? status : "prospect"),
    startDate: s("startDate") || null,
    endDate: s("endDate") || null,
    location: s("location") || null,
    notes: s("notes") || null,
  };
}

async function saveMembers(projectId: number, fd: FormData) {
  await db.delete(schema.projectMembers).where(eq(schema.projectMembers.projectId, projectId));
  const ownerId = Number(fd.get("ownerId")) || 0;
  const ids = [...new Set([...fd.getAll("memberIds").map(Number).filter(Boolean), ownerId].filter(Boolean))];
  if (ids.length) await db.insert(schema.projectMembers).values(ids.map((userId) => ({ projectId, userId })));
}

async function saveEvents(projectId: number, fd: FormData, type: string) {
  await db.delete(schema.projectEventTypes).where(eq(schema.projectEventTypes.projectId, projectId));
  if (type !== "mariage") return;
  const ids = fd.getAll("eventTypeIds").map(Number).filter(Boolean);
  if (ids.length)
    await db.insert(schema.projectEventTypes).values(
      ids.map((id) => ({ projectId, eventTypeId: id, eventDate: String(fd.get(`eventDate_${id}`) ?? "") || null }))
    );
}

export async function createProject(fd: FormData) {
  await requirePerm("projets", "write");
  const v = values(fd);
  const [p] = await db.insert(schema.projects).values(v).returning({ id: schema.projects.id });
  await saveEvents(p.id, fd, v.type);
  await saveMembers(p.id, fd);
  revalidatePath("/projets");
  redirect(`/projets/${p.id}`);
}

export async function updateProject(id: number, fd: FormData) {
  await requirePerm("projets", "write");
  const v = values(fd);
  await db.update(schema.projects).set(v).where(eq(schema.projects.id, id));
  await saveEvents(id, fd, v.type);
  await saveMembers(id, fd);
  revalidatePath(`/projets/${id}`);
  redirect(`/projets/${id}?ok=1`);
}

export async function deleteProject(id: number) {
  await requirePerm("projets", "write");
  const res = await db.execute(sql`SELECT (SELECT count(*) FROM invoices WHERE project_id = ${id}) AS n`);
  if (Number((res.rows[0] as any).n) > 0) redirect(`/projets/${id}?e=lie`);
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  revalidatePath("/projets");
  redirect("/projets");
}
