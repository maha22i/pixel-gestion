"use server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { createRemember, createSession, destroyRemember, destroySession, rememberIntent } from "@/lib/auth";
import { tokenHash } from "@/lib/attendance/token";

function safeNext(raw: string) {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) return "/";
  return raw.slice(0, 300);
}

export async function loginAction(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const ok = u && u.active && (await bcrypt.compare(password, u.passwordHash));
  if (!ok) redirect("/login?e=1");
  await createSession(u.id);
  if (fd.get("remember") === "on") {
    const deviceToken = String(fd.get("deviceToken") ?? "");
    if (deviceToken.length >= 16) {
      const hash = tokenHash(deviceToken);
      const [dev] = await db.select({ id: schema.attendanceDevices.id }).from(schema.attendanceDevices)
        .where(and(eq(schema.attendanceDevices.userId, u.id), eq(schema.attendanceDevices.tokenHash, hash)));
      if (dev) await createRemember(u.id, hash);
      else {
        const [anyDevice] = await db.select({ id: schema.attendanceDevices.id }).from(schema.attendanceDevices).where(eq(schema.attendanceDevices.userId, u.id));
        if (!anyDevice) rememberIntent();
      }
    }
  }
  redirect(safeNext(String(fd.get("next") ?? "")));
}

export async function logoutAction() {
  destroySession();
  destroyRemember();
  redirect("/login");
}
