"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { MODULES, moduleLevels, type Level } from "@/lib/modules";

/** Enregistre les droits par défaut d'un rôle. Les droits personnalisés des utilisateurs restent prioritaires. */
export async function saveRoleDefaults(role: "manager" | "technician", fd: FormData) {
  await requireAdmin();
  if (role !== "manager" && role !== "technician") redirect("/parametres?s=droits");
  const rows = MODULES.map((m) => {
    const raw = String(fd.get(`perm_${m.key}`) ?? "none") as Level;
    return { role, module: m.key as string, level: moduleLevels(m.key).includes(raw) ? raw : "none" };
  });
  await db.transaction(async (tx) => {
    await tx.insert(schema.rolePermissions).values(rows)
      .onConflictDoUpdate({ target: [schema.rolePermissions.role, schema.rolePermissions.module], set: { level: sql`excluded.level` } });
    // Une personnalisation devenue identique au nouveau défaut n'en est plus une : elle suivra désormais le rôle.
    for (const r of rows) {
      await tx.execute(sql`DELETE FROM permissions p USING users u
        WHERE p.user_id = u.id AND u.role = ${role} AND p.module = ${r.module} AND p.level = ${r.level}`);
    }
  });
  revalidatePath("/", "layout");
  redirect(`/parametres?s=droits&role=${role}&ok=1`);
}
