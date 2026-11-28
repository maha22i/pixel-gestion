"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { clearUpcoming, ensureProductions } from "@/lib/production";

type ItemInput = { id?: number; label: string; perMonth: number; weekdays: number[]; startTime: string; endTime: string; typeId: number | null; assigneeIds: number[] };
type PlanInput = { id?: number; projectId: number; name: string; startMonth: string; endMonth: string; items: ItemInput[] };

const MONTH = /^\d{4}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

async function writer() {
  const user = await requirePerm("planning");
  if (!(user.role === "admin" || user.perms.planning === "write")) redirect("/acces-refuse");
  return user;
}

function done(ok: string) {
  revalidatePath("/planning");
  revalidatePath("/taches");
  redirect(`/planning?productions=1&ok=${ok}`);
}

export async function savePlan(fd: FormData) {
  const user = await writer();
  let input: PlanInput;
  try { input = JSON.parse(String(fd.get("payload") ?? "{}")); } catch { redirect("/planning?production=nouveau&e=plan"); }
  const back = `/planning?production=${input.id || "nouveau"}`;
  const items = (input.items ?? [])
    .map((i) => ({
      id: Number(i.id) || 0,
      label: String(i.label ?? "").trim().slice(0, 80),
      perMonth: Math.min(31, Math.max(1, Math.round(Number(i.perMonth) || 1))),
      weekdays: [...new Set((i.weekdays ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort().join(","),
      startTime: TIME.test(i.startTime ?? "") ? i.startTime : null,
      endTime: TIME.test(i.endTime ?? "") ? i.endTime : null,
      typeId: Number(i.typeId) || null,
      assigneeIds: [...new Set((i.assigneeIds ?? []).map(Number).filter((n) => n > 0))].join(","),
    }))
    .filter((i) => i.label);
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!Number(input.projectId) || !name || !MONTH.test(input.startMonth ?? "") || (input.endMonth && (!MONTH.test(input.endMonth) || input.endMonth < input.startMonth))) redirect(`${back}&e=plan`);
  if (!items.length) redirect(`${back}&e=lignes`);
  if (items.some((i) => i.startTime && i.endTime && i.endTime <= i.startTime)) redirect(`${back}&e=heures`);

  let planId = Number(input.id) || 0;
  const values = { projectId: Number(input.projectId), name, startMonth: input.startMonth, endMonth: input.endMonth || null };
  if (planId) {
    const [cur] = await db.select().from(schema.productionPlans).where(eq(schema.productionPlans.id, planId));
    if (!cur) redirect("/planning?productions=1");
    await db.update(schema.productionPlans).set(values).where(eq(schema.productionPlans.id, planId));
  } else {
    [{ id: planId }] = await db.insert(schema.productionPlans).values({ ...values, createdBy: user.id }).returning({ id: schema.productionPlans.id });
  }

  // Les livrables à venir non commencés sont recalculés avec les nouveaux réglages ; le reste est conservé.
  const before = await db.select({ id: schema.productionPlanItems.id }).from(schema.productionPlanItems).where(eq(schema.productionPlanItems.planId, planId));
  await clearUpcoming(before.map((b) => b.id));
  const keep = new Set(items.map((i) => i.id).filter(Boolean));
  const removed = before.map((b) => b.id).filter((id) => !keep.has(id));
  if (removed.length) await db.delete(schema.productionPlanItems).where(inArray(schema.productionPlanItems.id, removed));
  for (const [position, i] of items.entries()) {
    const row = { planId, label: i.label, perMonth: i.perMonth, weekdays: i.weekdays, startTime: i.startTime, endTime: i.endTime, typeId: i.typeId, assigneeIds: i.assigneeIds, position };
    if (i.id && before.some((b) => b.id === i.id)) await db.update(schema.productionPlanItems).set(row).where(eq(schema.productionPlanItems.id, i.id));
    else await db.insert(schema.productionPlanItems).values(row);
  }
  await ensureProductions([planId]);
  done(input.id ? "modifie" : "cree");
}

export async function togglePlan(fd: FormData) {
  await writer();
  const id = Number(fd.get("id"));
  const [plan] = await db.select().from(schema.productionPlans).where(eq(schema.productionPlans.id, id));
  if (!plan) redirect("/planning?productions=1");
  await db.update(schema.productionPlans).set({ active: !plan.active }).where(eq(schema.productionPlans.id, id));
  const items = await db.select({ id: schema.productionPlanItems.id }).from(schema.productionPlanItems).where(eq(schema.productionPlanItems.planId, id));
  if (plan.active) await clearUpcoming(items.map((i) => i.id));
  else await ensureProductions([id]);
  done(plan.active ? "pause" : "reprise");
}

export async function deletePlan(fd: FormData) {
  await writer();
  const id = Number(fd.get("id"));
  const items = await db.select({ id: schema.productionPlanItems.id }).from(schema.productionPlanItems).where(eq(schema.productionPlanItems.planId, id));
  await clearUpcoming(items.map((i) => i.id));
  // Les livrables déjà commencés ou terminés restent dans les tâches.
  await db.delete(schema.productionPlans).where(eq(schema.productionPlans.id, id));
  done("supprime");
}
