"use server";
import fs from "node:fs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requirePerm } from "@/lib/auth";
import { today } from "@/lib/format";
import { AVAILABILITY, CONDITIONS, equipmentFilePath, nextEquipmentRef, saveEquipmentFile } from "@/lib/equipment";

function s(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}
function day(fd: FormData, k: string) {
  const v = s(fd, k);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function money(fd: FormData, k: string) {
  const v = s(fd, k).replace(/\s/g, "");
  if (!v) return null;
  return Math.max(0, Math.round(Number(v) || 0));
}

function fields(fd: FormData) {
  const condition = s(fd, "condition");
  const availability = s(fd, "availability");
  return {
    name: s(fd, "name") || "Matériel",
    categoryId: Number(s(fd, "categoryId")) || null,
    brand: s(fd, "brand") || null,
    model: s(fd, "model") || null,
    serialNumber: s(fd, "serial") || null,
    quantity: Math.max(1, Math.round(Number(s(fd, "quantity")) || 1)),
    description: s(fd, "description") || null,
    specs: s(fd, "specs") || null,
    purchaseDate: day(fd, "purchaseDate"),
    purchasePrice: money(fd, "purchasePrice"),
    supplier: s(fd, "supplier") || null,
    warrantyEnd: day(fd, "warrantyEnd"),
    locationId: Number(s(fd, "locationId")) || null,
    condition: condition in CONDITIONS ? condition : "bon",
    availability: availability in AVAILABILITY ? availability : "disponible",
    notes: s(fd, "notes") || null,
  };
}

async function attach(fd: FormData, equipmentId: number, userId: number) {
  const photo = fd.get("photo");
  const invoice = fd.get("invoice");
  if (photo instanceof File && photo.size > 0) await saveEquipmentFile(photo, equipmentId, userId, "photo");
  if (invoice instanceof File && invoice.size > 0) await saveEquipmentFile(invoice, equipmentId, userId, "facture");
}

export async function createEquipment(fd: FormData) {
  const user = await requirePerm("materiel", "write");
  const ref = await nextEquipmentRef();
  const [row] = await db.insert(schema.equipment).values({ ...fields(fd), ref }).returning();
  await attach(fd, row.id, user.id);
  revalidatePath("/materiel");
  redirect(`/materiel/${row.id}?ok=1`);
}

export async function updateEquipment(id: number, fd: FormData) {
  const user = await requirePerm("materiel", "write");
  const prev = (await db.select().from(schema.equipment).where(eq(schema.equipment.id, id)))[0];
  if (!prev) redirect("/materiel");
  const v = fields(fd);
  await db.update(schema.equipment).set(v).where(eq(schema.equipment.id, id));
  if (v.condition !== prev.condition) {
    await db.insert(schema.equipmentEvents).values({
      equipmentId: id, kind: "etat", actorId: user.id,
      conditionAfter: v.condition,
      note: `État : ${CONDITIONS[prev.condition] ?? prev.condition} → ${CONDITIONS[v.condition]}`,
    });
  }
  await attach(fd, id, user.id);
  revalidatePath("/materiel");
  redirect(`/materiel/${id}?ok=1`);
}

export async function deleteEquipment(id: number) {
  await requirePerm("materiel", "write");
  const files = await db.select().from(schema.equipmentFiles).where(eq(schema.equipmentFiles.equipmentId, id));
  await db.delete(schema.equipment).where(eq(schema.equipment.id, id));
  for (const f of files) await fs.promises.unlink(equipmentFilePath(f.storedName)).catch(() => {});
  revalidatePath("/materiel");
  redirect("/materiel");
}

export async function deleteEquipmentFile(id: number) {
  await requirePerm("materiel", "write");
  const [f] = await db.select().from(schema.equipmentFiles).where(eq(schema.equipmentFiles.id, id));
  if (!f) return;
  await db.delete(schema.equipmentFiles).where(eq(schema.equipmentFiles.id, id));
  await fs.promises.unlink(equipmentFilePath(f.storedName)).catch(() => {});
  revalidatePath(`/materiel/${f.equipmentId}`);
}

export async function createCategory(fd: FormData) {
  await requirePerm("materiel", "write");
  const name = s(fd, "name");
  if (!name) redirect("/materiel?gerer=categories&err=nom");
  const parentId = Number(s(fd, "parentId")) || null;
  if (parentId) {
    const [p] = await db.select().from(schema.equipmentCategories).where(eq(schema.equipmentCategories.id, parentId));
    if (!p || p.parentId) redirect("/materiel?gerer=categories&err=parent");
  }
  const rows = await db.select().from(schema.equipmentCategories).where(parentId ? eq(schema.equipmentCategories.parentId, parentId) : isNull(schema.equipmentCategories.parentId));
  const position = rows.reduce((m, r) => Math.max(m, r.position), 0) + 1;
  await db.insert(schema.equipmentCategories).values({ name, parentId, position });
  revalidatePath("/materiel");
  redirect("/materiel?gerer=categories&ok=ajoute");
}

export async function renameCategory(fd: FormData) {
  await requirePerm("materiel", "write");
  const id = Number(s(fd, "id"));
  const name = s(fd, "name");
  if (id && name) await db.update(schema.equipmentCategories).set({ name }).where(eq(schema.equipmentCategories.id, id));
  revalidatePath("/materiel");
  redirect("/materiel?gerer=categories&ok=renomme");
}

export async function moveCategory(id: number, dir: -1 | 1) {
  await requirePerm("materiel", "write");
  const [cur] = await db.select().from(schema.equipmentCategories).where(eq(schema.equipmentCategories.id, id));
  if (!cur) return;
  const siblings = await db.select().from(schema.equipmentCategories)
    .where(cur.parentId ? eq(schema.equipmentCategories.parentId, cur.parentId) : isNull(schema.equipmentCategories.parentId))
    .orderBy(asc(schema.equipmentCategories.position), asc(schema.equipmentCategories.id));
  const i = siblings.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) redirect("/materiel?gerer=categories");
  await db.update(schema.equipmentCategories).set({ position: siblings[j].position }).where(eq(schema.equipmentCategories.id, siblings[i].id));
  await db.update(schema.equipmentCategories).set({ position: siblings[i].position }).where(eq(schema.equipmentCategories.id, siblings[j].id));
  revalidatePath("/materiel");
  redirect("/materiel?gerer=categories");
}

export async function deleteCategory(id: number) {
  await requirePerm("materiel", "write");
  const kids = await db.select().from(schema.equipmentCategories).where(eq(schema.equipmentCategories.parentId, id));
  const used = await db.select({ id: schema.equipment.id }).from(schema.equipment).where(eq(schema.equipment.categoryId, id));
  if (kids.length || used.length) redirect("/materiel?gerer=categories&err=cat");
  await db.delete(schema.equipmentCategories).where(eq(schema.equipmentCategories.id, id));
  revalidatePath("/materiel");
  redirect("/materiel?gerer=categories&ok=supprime");
}

export async function createLocation(fd: FormData) {
  await requirePerm("materiel", "write");
  const name = s(fd, "name");
  if (!name) redirect("/materiel?gerer=emplacements&err=nom");
  const rows = await db.select().from(schema.equipmentLocations);
  const position = rows.reduce((m, r) => Math.max(m, r.position), 0) + 1;
  await db.insert(schema.equipmentLocations).values({ name, position });
  revalidatePath("/materiel");
  redirect("/materiel?gerer=emplacements&ok=ajoute");
}

export async function renameLocation(fd: FormData) {
  await requirePerm("materiel", "write");
  const id = Number(s(fd, "id"));
  const name = s(fd, "name");
  if (id && name) await db.update(schema.equipmentLocations).set({ name }).where(eq(schema.equipmentLocations.id, id));
  revalidatePath("/materiel");
  redirect("/materiel?gerer=emplacements&ok=renomme");
}

export async function deleteLocation(id: number) {
  await requirePerm("materiel", "write");
  await db.delete(schema.equipmentLocations).where(eq(schema.equipmentLocations.id, id));
  revalidatePath("/materiel");
  redirect("/materiel?gerer=emplacements&ok=supprime");
}

export async function reportBreakdown(id: number, fd: FormData) {
  const user = await requirePerm("materiel");
  await db.update(schema.equipment).set({ condition: "en_panne" }).where(eq(schema.equipment.id, id));
  await db.insert(schema.equipmentEvents).values({
    equipmentId: id, kind: "etat", actorId: user.id, conditionAfter: "en_panne",
    note: s(fd, "note") || "Signalement de panne",
  });
  revalidatePath("/materiel");
  redirect(`/materiel/${id}?ok=panne`);
}

export async function addMaintenance(id: number, fd: FormData) {
  const user = await requirePerm("materiel", "write");
  const cost = money(fd, "cost");
  const [ev] = await db.insert(schema.equipmentEvents).values({
    equipmentId: id,
    kind: "reparation",
    actorId: user.id,
    outDate: day(fd, "date") ?? today(),
    note: s(fd, "note") || "Entretien",
    cost,
    provider: s(fd, "provider") || null,
  }).returning();
  await db.update(schema.equipment).set({ condition: "en_reparation" }).where(eq(schema.equipment.id, id));
  await db.update(schema.equipment).set({ availability: "en_maintenance" }).where(and(eq(schema.equipment.id, id), sql`${schema.equipment.availability} <> 'en_utilisation'`));
  if (s(fd, "toExpense") === "1" && cost != null && can(user, "depenses", "write")) {
    const [item] = await db.select().from(schema.equipment).where(eq(schema.equipment.id, id));
    const [exp] = await db.insert(schema.expenses).values({
      date: day(fd, "date") ?? today(),
      category: "materiel",
      description: `Réparation ${item?.ref ?? ""} — ${item?.name ?? "matériel"} : ${s(fd, "note") || "entretien"}`.replace(/\s+/g, " ").trim(),
      supplier: s(fd, "provider") || null,
      amount: cost,
      createdBy: user.id,
    }).returning();
    await db.update(schema.equipmentEvents).set({ expenseId: exp.id }).where(eq(schema.equipmentEvents.id, ev.id));
    revalidatePath("/depenses");
  }
  revalidatePath("/materiel");
  redirect(`/materiel/${id}?ok=rep`);
}
