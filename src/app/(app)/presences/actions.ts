"use server";
import { revalidatePath } from "next/cache";
import { ABSENCE_KIND } from "@/lib/attendance/labels";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { clientIpFromHeaders, normalizeIp } from "@/lib/attendance/ip";
import { distanceMeters, finiteCoord } from "@/lib/attendance/geo";
import { djiboutiClock, djiboutiStamp } from "@/lib/attendance/time";

const HARD = new Set(["qr", "telephone", "telephone_autre", "gps_absent", "gps_hors", "position_site"]);

function done(ok: string) {
  revalidatePath("/presences");
  revalidatePath("/pointer");
  redirect(`/presences?vue=valider&ok=${ok}`);
}

export async function reviewPunch(fd: FormData) {
  const user = await requirePerm("presences", "write");
  const id = Number(fd.get("id"));
  const decision = fd.get("decision") === "refuse" ? "refuse" : "valide";
  const note = String(fd.get("note") ?? "").trim();
  if (decision === "refuse" && !note) redirect("/presences?vue=valider&e=motif");
  const [punch] = await db.select().from(schema.attendancePunches).where(eq(schema.attendancePunches.id, id));
  if (!punch || (punch.status !== "a_verifier" && punch.status !== "mission")) redirect("/presences?vue=valider");
  await db.update(schema.attendancePunches).set({
    status: decision,
    note: note || punch.note,
    validatedBy: user.id,
    validatedAt: new Date(),
  }).where(eq(schema.attendancePunches.id, id));
  await db.insert(schema.attendancePunchEvents).values({ punchId: id, actorId: user.id, action: decision, reason: note || null });
  done(decision);
}

export async function reviewMany(fd: FormData) {
  const user = await requirePerm("presences", "write");
  const decision = fd.get("decision") === "refuse" ? "refuse" : "valide";
  const note = String(fd.get("note") ?? "").trim();
  if (decision === "refuse" && !note) redirect("/presences?vue=valider&e=motif");
  const ids = fd.getAll("id").map((v) => Number(v)).filter((n) => n > 0);
  for (const id of ids) {
    const [punch] = await db.select().from(schema.attendancePunches).where(eq(schema.attendancePunches.id, id));
    if (!punch || (punch.status !== "a_verifier" && punch.status !== "mission")) continue;
    await db.update(schema.attendancePunches).set({ status: decision, note: note || punch.note, validatedBy: user.id, validatedAt: new Date() }).where(eq(schema.attendancePunches.id, id));
    await db.insert(schema.attendancePunchEvents).values({ punchId: id, actorId: user.id, action: decision, reason: note || null });
  }
  done("lot");
}

export async function validateIpBatch(fd: FormData) {
  const user = await requirePerm("presences", "write");
  const siteId = Number(fd.get("siteId"));
  const ip = normalizeIp(String(fd.get("ip") ?? ""));
  const today = djiboutiClock().day;
  const rows = await db.select().from(schema.attendancePunches).where(and(
    eq(schema.attendancePunches.day, today),
    eq(schema.attendancePunches.status, "a_verifier"),
    eq(schema.attendancePunches.siteId, siteId),
  ));
  for (const punch of rows) {
    if (normalizeIp(punch.ip ?? "") !== ip) continue;
    const codes = punch.reasonCodes.split(",").map((c) => c.trim()).filter(Boolean);
    if (!codes.includes("ip") || codes.some((c) => HARD.has(c))) continue;
    await db.update(schema.attendancePunches).set({ status: "valide", reasonCodes: "", validatedBy: user.id, validatedAt: new Date() }).where(eq(schema.attendancePunches.id, punch.id));
    await db.insert(schema.attendancePunchEvents).values({ punchId: punch.id, actorId: user.id, action: "valide", reason: "IP du bureau mise à jour" });
  }
  done("ip");
}

export async function adoptOfficeIp(fd: FormData) {
  const user = await requirePerm("presences", "write");
  const coords = finiteCoord(Number(fd.get("lat")), Number(fd.get("lng")));
  const ip = normalizeIp(clientIpFromHeaders(headers()));
  if (!coords) return { ok: false as const, message: "Active la localisation pour confirmer que tu es au bureau." };
  if (!ip) return { ok: false as const, message: "Le serveur ne voit pas l'adresse IP. Vérifie la configuration Nginx." };
  const sites = await db.select().from(schema.attendanceSites).where(eq(schema.attendanceSites.active, true));
  const site = sites.find((s) => s.lat != null && s.lng != null && distanceMeters(coords.lat, coords.lng, s.lat, s.lng) <= s.radiusM);
  if (!site) return { ok: false as const, message: "Ta position n'est dans aucun bureau. Connecte-toi au Wi-Fi du bureau, pas en 4G, puis réessaie." };
  await db.insert(schema.attendanceSiteIps).values({ siteId: site.id, ip, createdBy: user.id })
    .onConflictDoNothing({ target: [schema.attendanceSiteIps.siteId, schema.attendanceSiteIps.ip] });
  const today = djiboutiClock().day;
  const pending = await db.select().from(schema.attendancePunches).where(and(
    eq(schema.attendancePunches.day, today),
    eq(schema.attendancePunches.status, "a_verifier"),
    eq(schema.attendancePunches.siteId, site.id),
  ));
  const count = pending.filter((p) => normalizeIp(p.ip ?? "") === ip && p.reasonCodes.split(",").includes("ip") && !p.reasonCodes.split(",").some((c) => HARD.has(c.trim()))).length;
  revalidatePath("/presences");
  return { ok: true as const, message: `Adresse ${ip} enregistrée pour ${site.name}.`, count, siteId: site.id, ip };
}

export async function manualPunch(fd: FormData) {
  const user = await requirePerm("presences", "write");
  const userId = Number(fd.get("userId"));
  const day = String(fd.get("day") ?? "");
  const time = String(fd.get("time") ?? "");
  const kind = fd.get("kind") === "depart" ? "depart" : "arrivee";
  const note = String(fd.get("note") ?? "").trim();
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time) || !note) redirect("/presences?vue=mois&e=correction&corriger=1");
  const [punch] = await db.insert(schema.attendancePunches).values({
    userId,
    kind,
    channel: "bureau",
    punchedAt: djiboutiStamp(day, time),
    day,
    status: "valide",
    source: "manual",
    note,
    createdBy: user.id,
    validatedBy: user.id,
    validatedAt: new Date(),
    qrOk: false,
    ipOk: false,
  }).returning({ id: schema.attendancePunches.id });
  await db.insert(schema.attendancePunchEvents).values({ punchId: punch.id, actorId: user.id, action: "corrige", reason: note });
  revalidatePath("/presences");
  redirect(`/presences?vue=mois&mois=${day.slice(0, 7)}&employe=${userId}&ok=correction`);
}

export async function saveAbsence(fd: FormData) {
  const user = await requirePerm("presences", "write");
  const userId = Number(fd.get("userId"));
  const startDate = String(fd.get("start") ?? "");
  const endDate = String(fd.get("end") ?? "");
  const kind = String(fd.get("kind") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate || !reason) redirect(`/presences?vue=mois&employe=${userId || ""}&e=absence`);
  if (!(kind in ABSENCE_KIND)) redirect(`/presences?vue=mois&employe=${userId}&e=absence`);
  const overlap = await db.select({ id: schema.attendanceAbsences.id }).from(schema.attendanceAbsences).where(and(
    eq(schema.attendanceAbsences.userId, userId),
    lte(schema.attendanceAbsences.startDate, endDate),
    gte(schema.attendanceAbsences.endDate, startDate),
  ));
  if (overlap.length) redirect(`/presences?vue=mois&mois=${startDate.slice(0, 7)}&employe=${userId}&e=chevauche`);
  await db.insert(schema.attendanceAbsences).values({ userId, startDate, endDate, kind, reason, createdBy: user.id });
  revalidatePath("/presences");
  redirect(`/presences?vue=mois&mois=${startDate.slice(0, 7)}&employe=${userId}&ok=absence`);
}

export async function deleteAbsence(fd: FormData) {
  await requirePerm("presences", "write");
  const id = Number(fd.get("id"));
  const userId = Number(fd.get("userId"));
  const mois = String(fd.get("mois") ?? "");
  if (id) await db.delete(schema.attendanceAbsences).where(eq(schema.attendanceAbsences.id, id));
  revalidatePath("/presences");
  const month = /^\d{4}-\d{2}$/.test(mois) ? mois : "";
  redirect(`/presences?vue=mois${month ? `&mois=${month}` : ""}${userId ? `&employe=${userId}` : ""}&ok=absence`);
}

export async function resolveDevice(fd: FormData) {
  const user = await requirePerm("presences", "write");
  const id = Number(fd.get("id"));
  const accept = fd.get("decision") === "valide";
  const [request] = await db.select().from(schema.attendanceDeviceRequests).where(eq(schema.attendanceDeviceRequests.id, id));
  if (!request || request.status !== "pending") redirect("/presences?vue=valider");
  if (!accept) {
    await db.update(schema.attendanceDeviceRequests).set({ status: "refused", resolvedBy: user.id, resolvedAt: new Date() }).where(eq(schema.attendanceDeviceRequests.id, id));
    done("telephone");
  }
  const [taken] = await db.select().from(schema.attendanceDevices).where(eq(schema.attendanceDevices.tokenHash, request.tokenHash));
  if (taken && taken.userId !== request.userId) redirect("/presences?vue=valider&e=telephone");
  const [current] = await db.select().from(schema.attendanceDevices).where(eq(schema.attendanceDevices.userId, request.userId));
  if (current) {
    await db.update(schema.attendanceDevices).set({ tokenHash: request.tokenHash, userAgent: request.userAgent, approvedBy: user.id, approvedAt: new Date() }).where(eq(schema.attendanceDevices.id, current.id));
  } else {
    await db.insert(schema.attendanceDevices).values({ userId: request.userId, tokenHash: request.tokenHash, userAgent: request.userAgent, approvedBy: user.id, approvedAt: new Date() });
  }
  await db.update(schema.attendanceDeviceRequests).set({ status: "approved", resolvedBy: user.id, resolvedAt: new Date() }).where(eq(schema.attendanceDeviceRequests.id, id));
  done("telephone");
}
