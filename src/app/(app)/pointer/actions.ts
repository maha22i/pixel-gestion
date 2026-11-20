"use server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { recordPunch, type PunchResult } from "@/lib/attendance/punch";

export async function acceptConsent() {
  const user = await requirePerm("presences");
  await db.update(schema.users).set({ attendanceConsentAt: new Date() }).where(eq(schema.users.id, user.id));
}

export async function punchAction(fd: FormData): Promise<PunchResult> {
  const user = await requirePerm("presences");
  const num = (key: string) => {
    const raw = String(fd.get(key) ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return recordPunch(user, {
    mode: fd.get("mode") === "mission" ? "mission" : "bureau",
    secret: String(fd.get("secret") ?? "").trim(),
    lat: num("lat"),
    lng: num("lng"),
    accuracyM: num("accuracy"),
    deviceToken: String(fd.get("deviceToken") ?? "").trim(),
    persist: fd.get("persist") === "1",
    taskId: num("taskId"),
    projectId: num("projectId"),
    slipId: num("slipId"),
  });
}
