"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { CONDITIONS } from "@/lib/equipment";
import { RETURN_CONDITIONS } from "@/lib/equipmentLabels";
import {
  canManageSlips, inventoryAfterReturn, nextSlipNumber,
  overlappingSlips, parseLocalDateTime, qtyAvailable,
} from "@/lib/equipmentSlips";
import { notify } from "@/lib/tasks";
import { today } from "@/lib/format";

function s(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

function ids(fd: FormData, k: string) {
  return fd.getAll(k).map((v) => Number(v)).filter((n) => n > 0);
}

async function managersIds() {
  const rows = await db.select({ id: schema.users.id, role: schema.users.role }).from(schema.users).where(eq(schema.users.active, true));
  return rows.filter((u) => u.role === "admin" || u.role === "manager").map((u) => u.id);
}

async function assertMemberOrWrite(userId: number, slipId: number, write: boolean) {
  if (write) return true;
  const [m] = await db.select().from(schema.equipmentSlipMembers).where(and(
    eq(schema.equipmentSlipMembers.slipId, slipId),
    eq(schema.equipmentSlipMembers.userId, userId),
  ));
  return !!m;
}

type LineIn = { equipmentId: number; quantity: number; conditionOut: string; noteOut: string | null };

function parseLines(fd: FormData): LineIn[] {
  const equipmentIds = ids(fd, "equipmentId");
  const qtys = fd.getAll("qty").map((v) => Math.max(1, Math.round(Number(v) || 1)));
  const conditions = fd.getAll("conditionOut").map((v) => String(v));
  const notes = fd.getAll("noteOut").map((v) => String(v).trim() || null);
  const lines: LineIn[] = [];
  for (let i = 0; i < equipmentIds.length; i++) {
    const conditionOut = conditions[i] in CONDITIONS ? conditions[i] : "bon";
    lines.push({ equipmentId: equipmentIds[i], quantity: qtys[i] ?? 1, conditionOut, noteOut: notes[i] ?? null });
  }
  return lines;
}

async function syncMembers(slipId: number, memberIds: number[], responsibleId: number) {
  const set = [...new Set([...memberIds, responsibleId].filter(Boolean))];
  await db.delete(schema.equipmentSlipMembers).where(eq(schema.equipmentSlipMembers.slipId, slipId));
  if (set.length) await db.insert(schema.equipmentSlipMembers).values(set.map((userId) => ({ slipId, userId })));
}

async function syncItems(slipId: number, lines: LineIn[]) {
  await db.delete(schema.equipmentSlipItems).where(eq(schema.equipmentSlipItems.slipId, slipId));
  if (lines.length) {
    await db.insert(schema.equipmentSlipItems).values(lines.map((l) => ({
      slipId,
      equipmentId: l.equipmentId,
      quantity: l.quantity,
      conditionOut: l.conditionOut,
      noteOut: l.noteOut,
    })));
  }
}

async function validateStock(lines: LineIn[], exceptSlipId?: number) {
  for (const l of lines) {
    const [eqp] = await db.select().from(schema.equipment).where(eq(schema.equipment.id, l.equipmentId));
    if (!eqp) return `Matériel introuvable (#${l.equipmentId})`;
    if (eqp.condition === "en_panne" || eqp.condition === "en_reparation" || eqp.availability === "en_maintenance") {
      return `${eqp.name} est indisponible (${CONDITIONS[eqp.condition] ?? eqp.condition}).`;
    }
    const avail = await qtyAvailable(eqp.id, eqp.quantity, exceptSlipId);
    if (l.quantity > avail) return `${eqp.name} : seulement ${avail} disponible(s) sur ${eqp.quantity}.`;
  }
  return null;
}

function headerFrom(fd: FormData) {
  const outAt = parseLocalDateTime(s(fd, "outAt"));
  const expectedReturnAt = parseLocalDateTime(s(fd, "expectedReturn"));
  const projectId = Number(s(fd, "projectId")) || null;
  const off = s(fd, "offProjectReason") || null;
  return {
    projectId,
    offProjectReason: projectId ? null : (off || "Hors projet"),
    outAt: outAt ?? new Date(),
    expectedReturnAt: expectedReturnAt ?? new Date(Date.now() + 24 * 3600 * 1000),
    location: s(fd, "location") || "—",
    responsibleUserId: Number(s(fd, "responsibleUserId")) || null,
    notes: s(fd, "notes") || null,
  };
}

export async function saveSlip(fd: FormData) {
  const user = await requirePerm("materiel", "write");
  const id = Number(s(fd, "id")) || null;
  const memberIds = ids(fd, "memberIds");
  const lines = parseLines(fd);
  const h = headerFrom(fd);
  if (!h.responsibleUserId) redirect("/materiel/sorties/nouveau?err=resp");
  if (!memberIds.length && !h.responsibleUserId) redirect("/materiel/sorties/nouveau?err=equipe");
  if (!lines.length) redirect(id ? `/materiel/sorties/${id}?err=lignes` : "/materiel/sorties/nouveau?err=lignes");

  const stockErr = await validateStock(lines, id ?? undefined);
  if (stockErr) redirect((id ? `/materiel/sorties/${id}` : "/materiel/sorties/nouveau") + `?err=stock&msg=${encodeURIComponent(stockErr)}`);

  if (id) {
    const [slip] = await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, id));
    if (!slip || slip.status !== "brouillon") redirect(`/materiel/sorties/${id}`);
    await db.update(schema.equipmentSlips).set(h).where(eq(schema.equipmentSlips.id, id));
    await syncMembers(id, memberIds, h.responsibleUserId!);
    await syncItems(id, lines);
    revalidatePath("/materiel/sorties");
    redirect(`/materiel/sorties/${id}?ok=1`);
  }

  const number = await nextSlipNumber();
  const [slip] = await db.insert(schema.equipmentSlips).values({
    number,
    status: "brouillon",
    ...h,
    createdBy: user.id,
  }).returning();
  await syncMembers(slip.id, memberIds, h.responsibleUserId!);
  await syncItems(slip.id, lines);
  revalidatePath("/materiel/sorties");
  redirect(`/materiel/sorties/${slip.id}?ok=1`);
}

export async function validateSlip(id: number) {
  const user = await requirePerm("materiel", "write");
  const [slip] = await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, id));
  if (!slip || slip.status !== "brouillon") redirect(`/materiel/sorties/${id}`);
  const items = await db.select().from(schema.equipmentSlipItems).where(eq(schema.equipmentSlipItems.slipId, id));
  if (!items.length) redirect(`/materiel/sorties/${id}?err=lignes`);

  const stockErr = await validateStock(items.map((i) => ({
    equipmentId: i.equipmentId, quantity: i.quantity, conditionOut: i.conditionOut, noteOut: i.noteOut,
  })), id);
  if (stockErr) redirect(`/materiel/sorties/${id}?err=stock&msg=${encodeURIComponent(stockErr)}`);

  await db.update(schema.equipmentSlips).set({ status: "sorti", validatedAt: new Date() }).where(eq(schema.equipmentSlips.id, id));

  for (const it of items) {
    const [eqp] = await db.select().from(schema.equipment).where(eq(schema.equipment.id, it.equipmentId));
    if (!eqp) continue;
    const leftAfter = await qtyAvailable(eqp.id, eqp.quantity);
    await db.update(schema.equipment).set({
      availability: leftAfter <= 0 ? "en_utilisation" : eqp.availability === "en_maintenance" ? "en_maintenance" : "disponible",
      condition: it.conditionOut in CONDITIONS ? it.conditionOut : eqp.condition,
    }).where(eq(schema.equipment.id, eqp.id));
    await db.insert(schema.equipmentEvents).values({
      equipmentId: eqp.id,
      kind: "sortie",
      actorId: user.id,
      userId: slip.responsibleUserId,
      projectId: slip.projectId,
      slipId: id,
      outDate: slip.outAt.toISOString().slice(0, 10),
      expectedReturn: slip.expectedReturnAt.toISOString().slice(0, 10),
      note: `Bon ${slip.number} · qté ${it.quantity}${it.noteOut ? " · " + it.noteOut : ""}`,
    });
  }

  const members = await db.select().from(schema.equipmentSlipMembers).where(eq(schema.equipmentSlipMembers.slipId, id));
  await notify(
    members.map((m) => m.userId),
    "equipment",
    `Bon de sortie ${slip.number} validé — vous êtes dans l'équipe.`,
    undefined,
    user.id,
    `/materiel/sorties/${id}`,
  );
  revalidatePath("/materiel");
  revalidatePath("/materiel/sorties");
  if (slip.projectId) revalidatePath(`/projets/${slip.projectId}`);
  redirect(`/materiel/sorties/${id}?ok=sortie`);
}

export async function reportReturned(id: number) {
  const user = await requirePerm("materiel");
  const write = canManageSlips(user);
  const [slip] = await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, id));
  if (!slip || slip.status !== "sorti") redirect(`/materiel/sorties/${id}`);
  if (!(await assertMemberOrWrite(user.id, id, write))) redirect("/acces-refuse");

  await db.update(schema.equipmentSlips).set({
    status: "attente_controle",
    reportedAt: new Date(),
    reportedBy: user.id,
  }).where(eq(schema.equipmentSlips.id, id));

  await notify(
    await managersIds(),
    "equipment",
    `Matériel rapporté — ${slip.number} en attente de contrôle.`,
    undefined,
    user.id,
    `/materiel/sorties/${id}`,
  );
  revalidatePath(`/materiel/sorties/${id}`);
  redirect(`/materiel/sorties/${id}?ok=rapporte`);
}

export async function checkSlip(id: number, fd: FormData) {
  const user = await requirePerm("materiel", "write");
  const [slip] = await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, id));
  if (!slip || (slip.status !== "attente_controle" && slip.status !== "sorti")) {
    redirect(`/materiel/sorties/${id}`);
  }
  const items = await db.select().from(schema.equipmentSlipItems).where(eq(schema.equipmentSlipItems.slipId, id));
  let anomalies = 0;

  for (const it of items) {
    const returned = s(fd, `returned_${it.id}`) || "oui";
    const qtyReturned = Math.max(0, Math.round(Number(s(fd, `qtyReturned_${it.id}`)) || 0));
    const conditionIn = s(fd, `conditionIn_${it.id}`);
    const noteIn = s(fd, `noteIn_${it.id}`) || null;
    const cond = conditionIn in RETURN_CONDITIONS ? conditionIn : "bon";
    const finalReturned = returned === "partiel" || returned === "non" || returned === "oui" ? returned : "oui";
    const qRet = finalReturned === "oui" ? it.quantity : finalReturned === "non" ? 0 : Math.min(qtyReturned, it.quantity);

    await db.update(schema.equipmentSlipItems).set({
      returned: finalReturned,
      qtyReturned: qRet,
      conditionIn: cond,
      noteIn,
    }).where(eq(schema.equipmentSlipItems.id, it.id));

    const inv = inventoryAfterReturn(finalReturned, cond, it.quantity, qRet);
    if (inv.missing || cond === "endommage" || cond === "en_panne") anomalies++;

    const [eqp] = await db.select().from(schema.equipment).where(eq(schema.equipment.id, it.equipmentId));
    if (!eqp) continue;

    // Apply inventory for returned portion
    if (finalReturned !== "non") {
      const updates: { availability?: string; condition?: string } = {};
      if (inv.condition) updates.condition = inv.condition;
      await db.update(schema.equipment).set(updates).where(eq(schema.equipment.id, eqp.id));
    }

    await db.insert(schema.equipmentEvents).values({
      equipmentId: it.equipmentId,
      kind: "retour",
      actorId: user.id,
      userId: slip.responsibleUserId,
      projectId: slip.projectId,
      slipId: id,
      returnDate: today(),
      conditionAfter: inv.condition,
      note: `Contrôle ${slip.number} · ${finalReturned}${noteIn ? " · " + noteIn : ""}`,
    });
  }

  // Recompute availability for all touched equipment after all lines
  const eqIds = [...new Set(items.map((i) => i.equipmentId))];
  for (const eid of eqIds) {
    const [eqp] = await db.select().from(schema.equipment).where(eq(schema.equipment.id, eid));
    if (!eqp) continue;
    const left = await qtyAvailable(eqp.id, eqp.quantity);
    const itemRows = items.filter((i) => i.equipmentId === eid);
    const worst = itemRows.some((i) => {
      const c = s(fd, `conditionIn_${i.id}`);
      return c === "en_panne" || c === "endommage";
    });
    let availability: string = left <= 0 ? "en_utilisation" : "disponible";
    if (worst && left > 0) availability = "en_maintenance";
    if (eqp.condition === "en_panne" || eqp.condition === "en_reparation") availability = left <= 0 ? "en_utilisation" : "en_maintenance";
    // Prefer maintenance if any returned unit was damaged
    const anyDamaged = itemRows.some((i) => {
      const r = s(fd, `returned_${i.id}`) || "oui";
      const c = s(fd, `conditionIn_${i.id}`);
      return r !== "non" && (c === "en_panne" || c === "endommage");
    });
    if (anyDamaged) {
      const cond = itemRows.map((i) => s(fd, `conditionIn_${i.id}`)).includes("en_panne") ? "en_panne" : "use";
      await db.update(schema.equipment).set({
        condition: cond,
        availability: left <= 0 ? "en_utilisation" : "en_maintenance",
      }).where(eq(schema.equipment.id, eid));
    } else {
      await db.update(schema.equipment).set({ availability }).where(eq(schema.equipment.id, eid));
    }
  }

  const status = anomalies > 0 ? "cloture_anomalies" : "cloture";
  await db.update(schema.equipmentSlips).set({
    status,
    checkedAt: new Date(),
    checkedBy: user.id,
  }).where(eq(schema.equipmentSlips.id, id));

  revalidatePath("/materiel");
  revalidatePath(`/materiel/sorties/${id}`);
  if (slip.projectId) revalidatePath(`/projets/${slip.projectId}`);
  redirect(`/materiel/sorties/${id}?ok=controle`);
}

export async function returnMissingItem(itemId: number, fd: FormData) {
  const user = await requirePerm("materiel", "write");
  const [item] = await db.select().from(schema.equipmentSlipItems).where(eq(schema.equipmentSlipItems.id, itemId));
  if (!item) redirect("/materiel/sorties");
  const [slip] = await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, item.slipId));
  if (!slip || slip.status !== "cloture_anomalies") redirect(`/materiel/sorties/${item.slipId}`);

  const conditionIn = s(fd, "conditionIn");
  const cond = conditionIn in RETURN_CONDITIONS ? conditionIn : "bon";
  const noteIn = s(fd, "note") || null;
  await db.update(schema.equipmentSlipItems).set({
    returned: "oui",
    qtyReturned: item.quantity,
    conditionIn: cond,
    noteIn: [item.noteIn, noteIn].filter(Boolean).join(" · ") || null,
  }).where(eq(schema.equipmentSlipItems.id, itemId));

  const [eqp] = await db.select().from(schema.equipment).where(eq(schema.equipment.id, item.equipmentId));
  if (eqp) {
    const mapped = cond === "en_panne" ? "en_panne" : cond === "endommage" ? "use" : cond === "use" ? "use" : "bon";
    const left = await qtyAvailable(eqp.id, eqp.quantity);
    const bad = mapped === "en_panne" || cond === "endommage";
    await db.update(schema.equipment).set({
      condition: mapped,
      availability: left <= 0 ? "en_utilisation" : bad ? "en_maintenance" : "disponible",
    }).where(eq(schema.equipment.id, eqp.id));
    await db.insert(schema.equipmentEvents).values({
      equipmentId: eqp.id, kind: "retour", actorId: user.id, slipId: slip.id,
      returnDate: today(), conditionAfter: mapped,
      note: `Retour différé ${slip.number}${noteIn ? " · " + noteIn : ""}`,
    });
  }

  const remaining = await db.select().from(schema.equipmentSlipItems).where(eq(schema.equipmentSlipItems.slipId, slip.id));
  const missingLeft = remaining.some((r) => {
    if (r.id === itemId) return false;
    if (!r.returned || r.returned === "non") return true;
    if (r.returned === "partiel" && (r.qtyReturned ?? 0) < r.quantity) return true;
    return false;
  });
  const damaged = remaining.some((r) => r.conditionIn === "endommage" || r.conditionIn === "en_panne");
  await db.update(schema.equipmentSlips).set({
    status: missingLeft || damaged ? "cloture_anomalies" : "cloture",
  }).where(eq(schema.equipmentSlips.id, slip.id));

  revalidatePath("/materiel");
  revalidatePath(`/materiel/sorties/${slip.id}`);
  redirect(`/materiel/sorties/${slip.id}?ok=rentre`);
}

export async function duplicateSlip(id: number) {
  const user = await requirePerm("materiel", "write");
  const [slip] = await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, id));
  if (!slip) redirect("/materiel/sorties");
  const members = await db.select().from(schema.equipmentSlipMembers).where(eq(schema.equipmentSlipMembers.slipId, id));
  const items = await db.select().from(schema.equipmentSlipItems).where(eq(schema.equipmentSlipItems.slipId, id));
  const number = await nextSlipNumber();
  const now = new Date();
  const later = new Date(now.getTime() + 24 * 3600 * 1000);
  const [copy] = await db.insert(schema.equipmentSlips).values({
    number,
    status: "brouillon",
    projectId: slip.projectId,
    offProjectReason: slip.offProjectReason,
    outAt: now,
    expectedReturnAt: later,
    location: slip.location,
    responsibleUserId: slip.responsibleUserId,
    notes: slip.notes,
    createdBy: user.id,
  }).returning();
  if (members.length) await db.insert(schema.equipmentSlipMembers).values(members.map((m) => ({ slipId: copy.id, userId: m.userId })));
  if (items.length) {
    await db.insert(schema.equipmentSlipItems).values(items.map((i) => ({
      slipId: copy.id,
      equipmentId: i.equipmentId,
      quantity: i.quantity,
      conditionOut: i.conditionOut,
      noteOut: i.noteOut,
    })));
  }
  redirect(`/materiel/sorties/${copy.id}?ok=dup`);
}

export async function deleteSlip(id: number) {
  await requirePerm("materiel", "write");
  const [slip] = await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, id));
  if (!slip || slip.status !== "brouillon") redirect("/materiel/sorties");
  await db.delete(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, id));
  revalidatePath("/materiel/sorties");
  redirect("/materiel/sorties");
}

export async function warnOverlaps(equipmentId: number, outAt: string, expected: string, except?: number) {
  await requireUser();
  const a = parseLocalDateTime(outAt);
  const b = parseLocalDateTime(expected);
  if (!a || !b) return [];
  return overlappingSlips(equipmentId, a, b, except);
}
