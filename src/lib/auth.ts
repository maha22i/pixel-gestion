import "server-only";
import { effectivePerms, roleDefaults } from "@/lib/permissions";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeRole, type AppRole, type Level, type ModuleKey } from "./modules";

export const SESSION_COOKIE = "pf_session";
export const SESSION_ACTIVITY_COOKIE = "pf_last_seen";
export const REMEMBER_COOKIE = "pf_remember";
export const REMEMBER_INTENT_COOKIE = "pf_remember_intent";
const REMEMBER_SECONDS = 30 * 24 * 60 * 60;

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge,
  };
}

function envInt(name: string, fallback: number) {
  const n = Number(process.env[name] ?? "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const SESSION_MAX_AGE_SECONDS = envInt("SESSION_MAX_AGE_SECONDS", 12 * 60 * 60);
const SESSION_IDLE_SECONDS = envInt("SESSION_IDLE_SECONDS", 30 * 60);

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET manquant ou trop court (32 caractères minimum)");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: number) {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(now + SESSION_MAX_AGE_SECONDS)
    .sign(secret());
  cookies().set(SESSION_COOKIE, token, cookieOpts(SESSION_MAX_AGE_SECONDS));
  cookies().set(SESSION_ACTIVITY_COOKIE, String(now), cookieOpts(SESSION_IDLE_SECONDS));
}

export async function createRemember(userId: number, deviceTokenHash: string) {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ uid: userId, dev: deviceTokenHash, scope: "punch" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(now + REMEMBER_SECONDS)
    .sign(secret());
  cookies().set(REMEMBER_COOKIE, token, cookieOpts(REMEMBER_SECONDS));
}

export function rememberIntent() {
  cookies().set(REMEMBER_INTENT_COOKIE, "1", cookieOpts(REMEMBER_SECONDS));
}

export function destroyRemember() {
  cookies().delete(REMEMBER_COOKIE);
  cookies().delete(REMEMBER_INTENT_COOKIE);
}

export function destroySession() {
  cookies().delete(SESSION_COOKIE);
  cookies().delete(SESSION_ACTIVITY_COOKIE);
}

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: AppRole;
  perms: Record<ModuleKey, Level>;
};

async function loadUser(uid: number): Promise<SessionUser | null> {
  if (!Number.isFinite(uid)) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, uid));
  if (!u || !u.active) return null;
  const rows = await db.select().from(schema.permissions).where(eq(schema.permissions.userId, uid));
  const role = normalizeRole(u.role);
  // Droits du rôle (Paramètres), remplacés module par module par les droits personnels.
  const perms = effectivePerms(role, await roleDefaults(), rows);
  return { id: u.id, name: u.name, email: u.email, role, perms };
}

export async function getUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      const user = await loadUser(Number(payload.uid));
      if (user) return user;
    } catch { /* session illisible */ }
  }
  if (headers().get("x-pf-auth") !== "remember") return null;
  const remembered = cookies().get(REMEMBER_COOKIE)?.value;
  if (!remembered) return null;
  try {
    const { payload } = await jwtVerify(remembered, secret());
    if (payload.scope !== "punch" || typeof payload.dev !== "string") return null;
    const uid = Number(payload.uid);
    const [dev] = await db.select({ id: schema.attendanceDevices.id }).from(schema.attendanceDevices)
      .where(and(eq(schema.attendanceDevices.userId, uid), eq(schema.attendanceDevices.tokenHash, payload.dev)));
    if (!dev) return null;
    return loadUser(uid);
  } catch {
    return null;
  }
}

export function can(user: SessionUser, module: ModuleKey, level: "read" | "write" = "read") {
  const l = user.perms[module];
  if (level === "read") return l === "own" || l === "read" || l === "write";
  return l === "write";
}

export function canFinance(user: SessionUser) {
  return can(user, "factures") || can(user, "paiements") || can(user, "depenses");
}

export async function requireUser() {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export async function requirePerm(module: ModuleKey, level: "read" | "write" = "read") {
  const u = await requireUser();
  if (!can(u, module, level)) redirect("/acces-refuse");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/acces-refuse");
  return u;
}
