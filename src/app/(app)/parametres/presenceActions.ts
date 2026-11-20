"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { clientIpFromHeaders, normalizeIp } from "@/lib/attendance/ip";
import { newQrSecret } from "@/lib/attendance/token";

function back(ok: string) {
  revalidatePath("/parametres");
  redirect(`/parametres?presence=${ok}`);
}

export async function saveSchedule(fd: FormData) {
  await requireAdmin();
  const days = ["0", "1", "2", "3", "4", "5", "6"].filter((d) => fd.get(`day_${d}`) === "on");
  const start = String(fd.get("startTime") ?? "08:00");
  const end = String(fd.get("endTime") ?? "17:00");
  const tolerance = Math.max(0, Math.min(180, Number(fd.get("tolerance") ?? 15) || 0));
  if (!days.length || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) redirect("/parametres?presence=horaire");
  await db.update(schema.attendanceSchedule).set({
    workDays: days.join(","),
    startTime: start,
    endTime: end,
    lateToleranceMin: tolerance,
  }).where(eq(schema.attendanceSchedule.id, 1));
  back("horaire");
}

export async function saveSite(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const name = String(fd.get("name") ?? "").trim();
  if (!id || !name) redirect("/parametres?presence=site");
  const latRaw = String(fd.get("lat") ?? "").trim();
  const lngRaw = String(fd.get("lng") ?? "").trim();
  const lat = latRaw === "" ? null : Number(latRaw);
  const lng = lngRaw === "" ? null : Number(lngRaw);
  const radius = Math.max(20, Math.min(1000, Number(fd.get("radius") ?? 100) || 100));
  await db.update(schema.attendanceSites).set({
    name,
    address: String(fd.get("address") ?? "").trim(),
    lat: lat != null && Number.isFinite(lat) ? lat : null,
    lng: lng != null && Number.isFinite(lng) ? lng : null,
    radiusM: radius,
    active: fd.get("active") === "on",
  }).where(eq(schema.attendanceSites.id, id));
  back("site");
}

export async function addSite(fd: FormData) {
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) redirect("/parametres?presence=site");
  await db.insert(schema.attendanceSites).values({ name, address: String(fd.get("address") ?? "").trim(), radiusM: 100 });
  back("site");
}

export async function generateQr(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const [site] = await db.select().from(schema.attendanceSites).where(eq(schema.attendanceSites.id, id));
  if (!site) redirect("/parametres");
  if (!site.qrSecret || fd.get("force") === "1") {
    await db.update(schema.attendanceSites).set({ qrSecret: newQrSecret() }).where(eq(schema.attendanceSites.id, id));
  }
  back("qr");
}

export async function addCurrentIp(fd: FormData) {
  const user = await requireAdmin();
  const siteId = Number(fd.get("id"));
  const ip = normalizeIp(clientIpFromHeaders(headers()));
  if (!siteId || !ip) redirect("/parametres?presence=ip");
  await db.insert(schema.attendanceSiteIps).values({ siteId, ip, createdBy: user.id })
    .onConflictDoNothing({ target: [schema.attendanceSiteIps.siteId, schema.attendanceSiteIps.ip] });
  back("ip");
}

export async function deleteIp(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (id) await db.delete(schema.attendanceSiteIps).where(eq(schema.attendanceSiteIps.id, id));
  back("ip");
}

export async function addHoliday(fd: FormData) {
  await requireAdmin();
  const day = String(fd.get("day") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !name) redirect("/parametres?presence=ferie");
  await db.insert(schema.attendanceHolidays).values({ day, name }).onConflictDoNothing({ target: schema.attendanceHolidays.day });
  back("ferie");
}

export async function deleteHoliday(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (id) await db.delete(schema.attendanceHolidays).where(eq(schema.attendanceHolidays.id, id));
  back("ferie");
}

export async function resetDevice(fd: FormData) {
  const admin = await requireAdmin();
  const userId = Number(fd.get("userId"));
  if (!userId) redirect("/parametres");
  await db.delete(schema.attendanceDevices).where(eq(schema.attendanceDevices.userId, userId));
  await db.update(schema.attendanceDeviceRequests).set({ status: "refused", resolvedBy: admin.id, resolvedAt: new Date() })
    .where(and(eq(schema.attendanceDeviceRequests.userId, userId), eq(schema.attendanceDeviceRequests.status, "pending")));
  back("telephone");
}
