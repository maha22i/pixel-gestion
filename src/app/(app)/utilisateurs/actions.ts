"use server";
import { redirect } from "next/navigation";
import { NOTIFY_KEYS } from "@/lib/notifyTypes";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { MODULES, moduleLevels, normalizeRole } from "@/lib/modules";
import { roleDefaults } from "@/lib/permissions";
import { imageExt, logoTooBig } from "@/lib/logo";
import fs from "node:fs";
import path from "node:path";

const LEVELS = ["none", "own", "read", "write"];

function permsFrom(fd: FormData) {
  return MODULES.filter((m) => fd.has(`perm_${m.key}`)).map((m) => {
    const v = String(fd.get(`perm_${m.key}`) ?? "none");
    const level = LEVELS.includes(v) && (moduleLevels(m.key) as string[]).includes(v) ? v : "none";
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
  const me = await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const role = normalizeRole(String(fd.get("role") ?? "technician"));
  if (!name || !email || password.length < 8) redirect("/utilisateurs?nouveau=1&e=champs");
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) redirect("/utilisateurs?nouveau=1&e=email");
  // Contrat de travail saisi avec le compte (facultatif : « Sans contrat »).
  const kind = String(fd.get("contractType") ?? "aucun");
  const start = String(fd.get("contractStart") ?? "").trim();
  const end = String(fd.get("contractEnd") ?? "").trim();
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const withContract = ["cdi", "cdd", "stage", "prestataire"].includes(kind);
  if (withContract && (!DATE.test(start) || (end && (!DATE.test(end) || end < start)) || ((kind === "cdd" || kind === "stage") && !end))) {
    redirect("/utilisateurs?nouveau=1&e=contrat");
  }
  const avatarPath = await avatarFrom(fd);
  if (avatarPath === null) redirect("/utilisateurs?nouveau=1&e=avatar");
  const [u] = await db
    .insert(schema.users)
    .values({ name, email, role, passwordHash: await bcrypt.hash(password, 12), ...profileFrom(fd), avatarPath: avatarPath ?? null })
    .returning({ id: schema.users.id });
  if (withContract) {
    await db.insert(schema.employmentContracts).values({
      userId: u.id,
      contractType: kind,
      jobTitle: profileFrom(fd).jobTitle ?? "",
      startDate: start,
      endDate: kind === "cdi" ? null : end || null,
      createdBy: me.id,
    });
    revalidatePath("/rh");
  }
  // Aucun droit personnel à la création : le compte hérite des droits par défaut de son rôle (Paramètres).
  revalidatePath("/utilisateurs");
  redirect(`/utilisateurs?ok=cree&droits=${u.id}`);
}

/** Fenêtre « Modifier » : compte uniquement (les droits ne sont pas touchés). */
export async function updateAccount(id: number, fd: FormData) {
  const me = await requireAdmin();
  const back = `/utilisateurs?modifier=${id}`;
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!name || !email) redirect(`${back}&e=champs`);
  const active = id === me.id ? true : fd.get("active") === "on";
  const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.email, email), ne(schema.users.id, id)));
  if (dup) redirect(`${back}&e=email`);
  const avatarPath = await avatarFrom(fd);
  if (avatarPath === null) redirect(`${back}&e=avatar`);
  const password = String(fd.get("password") ?? "");
  if (password && password.length < 8) redirect(`${back}&e=mdp`);
  await db.update(schema.users).set({ name, email, active, ...profileFrom(fd), ...(avatarPath ? { avatarPath } : {}) }).where(eq(schema.users.id, id));
  if (password) await db.update(schema.users).set({ passwordHash: await bcrypt.hash(password, 12) }).where(eq(schema.users.id, id));
  revalidatePath("/utilisateurs");
  revalidatePath("/", "layout");
  redirect("/utilisateurs?ok=compte");
}

/** Fenêtre « Droits » : rôle et niveau d'accès par module. */
export async function updatePermissions(id: number, fd: FormData) {
  const me = await requireAdmin();
  const role = id === me.id ? "admin" : normalizeRole(String(fd.get("role") ?? "technician"));
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, id));
  // On ne garde en droits personnels que ce qui diffère du défaut du rôle ; le reste est hérité.
  await db.delete(schema.permissions).where(eq(schema.permissions.userId, id));
  if (role !== "admin") {
    const defaults = (await roleDefaults())[role];
    const custom = permsFrom(fd).filter((p) => p.level !== defaults[p.module as keyof typeof defaults]);
    if (custom.length) await db.insert(schema.permissions).values(custom.map((p) => ({ ...p, userId: id })));
  }
  revalidatePath("/utilisateurs");
  revalidatePath("/", "layout");
  redirect("/utilisateurs?ok=droits");
}

export async function deleteUser(id: number, _fd?: FormData) {
  const me = await requireAdmin();
  if (id === me.id) redirect("/utilisateurs");
  await db.delete(schema.users).where(eq(schema.users.id, id));
  revalidatePath("/utilisateurs");
  redirect("/utilisateurs?ok=supprime");
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
  const prefs = Object.fromEntries(NOTIFY_KEYS.map((k) => [k, fd.get(`mail_${k}`) === "on"]));
  await db.update(schema.users).set({ notifyPrefs: prefs }).where(eq(schema.users.id, me.id));
  const back = String(fd.get("back") ?? "");
  redirect(back === "/parametres?s=notifications" ? `${back}&ok=1` : "/profil?ok=notif");
}
