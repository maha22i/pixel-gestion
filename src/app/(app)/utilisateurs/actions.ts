"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { MODULES, normalizeRole } from "@/lib/modules";
import { imageExt, logoTooBig } from "@/lib/logo";
import fs from "node:fs";
import path from "node:path";

const LEVELS = ["none", "own", "read", "write"];

function permsFrom(fd: FormData) {
  return MODULES.map((m) => {
    const v = String(fd.get(`perm_${m.key}`) ?? "none");
    let level = LEVELS.includes(v) ? v : "none";
    if (m.key !== "taches" && m.key !== "presences" && level === "own") level = "none";
    return { module: m.key, level };
  });
}

async function avatarFrom(fd: FormData) {
  const file = fd.get("avatar");
  if (!(file instanceof File) || file.size === 0) return undefined;
  const buf = Buffer.from(await file.arrayBuffer());
  if (!imageExt(buf) || logoTooBig(buf.length)) return null;
  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.promises.mkdir(dir, { recursive: true });
  const ext = imageExt(buf)!;
  const name = `avatar-${Date.now()}.${ext}`;
  await fs.promises.writeFile(path.join(dir, name), buf);
  return `/uploads/${name}`;
}

function profileFrom(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    jobTitle: s("jobTitle") || null,
    phone: s("phone") || null,
    color: /^#[0-9a-fA-F]{6}$/.test(s("color")) ? s("color") : "#2C3E50",
  };
}

export async function createUser(fd: FormData) {
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const role = normalizeRole(String(fd.get("role") ?? "technician"));
  if (!name || !email || password.length < 8) redirect("/utilisateurs/nouveau?e=champs");
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) redirect("/utilisateurs/nouveau?e=email");
  const avatarPath = await avatarFrom(fd);
  if (avatarPath === null) redirect("/utilisateurs/nouveau?e=avatar");
  const [u] = await db
    .insert(schema.users)
    .values({ name, email, role, passwordHash: await bcrypt.hash(password, 12), ...profileFrom(fd), avatarPath: avatarPath ?? null })
    .returning({ id: schema.users.id });
  await db.insert(schema.permissions).values(permsFrom(fd).map((p) => ({ ...p, userId: u.id })));
  revalidatePath("/utilisateurs");
  redirect("/utilisateurs");
}

export async function updateUser(id: number, fd: FormData) {
  const me = await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  let role = normalizeRole(String(fd.get("role") ?? "technician"));
  let active = fd.get("active") === "on";
  if (id === me.id) { role = "admin"; active = true; }
  const [dup] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(and(eq(schema.users.email, email), ne(schema.users.id, id)));
  if (dup) redirect(`/utilisateurs/${id}?e=email`);
  const avatarPath = await avatarFrom(fd);
  if (avatarPath === null) redirect(`/utilisateurs/${id}?e=avatar`);
  await db.update(schema.users).set({
    name, email, role, active, ...profileFrom(fd),
    ...(avatarPath ? { avatarPath } : {}),
  }).where(eq(schema.users.id, id));
  const password = String(fd.get("password") ?? "");
  if (password) {
    if (password.length < 8) redirect(`/utilisateurs/${id}?e=mdp`);
    await db.update(schema.users).set({ passwordHash: await bcrypt.hash(password, 12) }).where(eq(schema.users.id, id));
  }
  for (const p of permsFrom(fd)) {
    await db.execute(sql`
      INSERT INTO permissions (user_id, module, level) VALUES (${id}, ${p.module}, ${p.level})
      ON CONFLICT (user_id, module) DO UPDATE SET level = EXCLUDED.level`);
  }
  revalidatePath("/utilisateurs");
  redirect("/utilisateurs?ok=1");
}

export async function deleteUser(id: number) {
  const me = await requireAdmin();
  if (id === me.id) redirect("/utilisateurs");
  await db.delete(schema.users).where(eq(schema.users.id, id));
  revalidatePath("/utilisateurs");
  redirect("/utilisateurs");
}

export async function changeOwnPassword(fd: FormData) {
  const me = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, me.id));
  if (!(await bcrypt.compare(current, u.passwordHash))) redirect("/profil?e=actuel");
  if (next.length < 8 || next !== String(fd.get("confirm") ?? "")) redirect("/profil?e=nouveau");
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(next, 12) }).where(eq(schema.users.id, me.id));
  redirect("/profil?ok=1");
}

export async function saveNotifyPrefs(fd: FormData) {
  const me = await requireUser();
  const keys = ["assign", "mention", "comment", "due", "review", "blocked", "presence_refuse", "presence_telephone", "presence_absent", "presence_depart"];
  const prefs = Object.fromEntries(keys.map((k) => [k, fd.get(`mail_${k}`) === "on"]));
  await db.update(schema.users).set({ notifyPrefs: prefs }).where(eq(schema.users.id, me.id));
  redirect("/profil?ok=1");
}
