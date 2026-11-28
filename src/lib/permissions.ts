import "server-only";
import { db, schema } from "@/db";
import { MODULES, ROLE_DEFAULTS, normalizeRole, type AppRole, type Level, type ModuleKey } from "@/lib/modules";

export type PermMap = Record<ModuleKey, Level>;

/** Droits par défaut de chaque rôle (base de données, complétée par les valeurs d'usine). */
export async function roleDefaults(): Promise<Record<AppRole, PermMap>> {
  const rows = await db.select().from(schema.rolePermissions);
  const out = {
    admin: { ...ROLE_DEFAULTS.admin },
    manager: { ...ROLE_DEFAULTS.manager },
    technician: { ...ROLE_DEFAULTS.technician },
  };
  for (const r of rows) {
    if ((r.role === "manager" || r.role === "technician") && MODULES.some((m) => m.key === r.module)) out[r.role][r.module as ModuleKey] = r.level as Level;
  }
  return out;
}

/** Droits effectifs : défaut du rôle, remplacé module par module par les droits personnels. */
export function effectivePerms(role: string, defaults: Record<AppRole, PermMap>, overrides: { module: string; level: string }[]): PermMap {
  const r = normalizeRole(role);
  if (r === "admin") return { ...ROLE_DEFAULTS.admin };
  const perms = { ...defaults[r] };
  for (const o of overrides) if (o.module in perms) perms[o.module as ModuleKey] = o.level as Level;
  return perms;
}

/** Utilisateurs actifs ayant au moins `level` sur un module (pour les notifications). */
export async function usersWith(module: ModuleKey, level: "read" | "write") {
  const [users, overrides, defaults] = await Promise.all([
    db.select({ id: schema.users.id, role: schema.users.role, active: schema.users.active }).from(schema.users),
    db.select().from(schema.permissions),
    roleDefaults(),
  ]);
  return users.filter((u) => u.active).filter((u) => {
    const l = effectivePerms(u.role, defaults, overrides.filter((o) => o.userId === u.id))[module];
    return level === "write" ? l === "write" : l === "own" || l === "read" || l === "write";
  }).map((u) => u.id);
}
