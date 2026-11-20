import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { MODULES, roleLabel } from "@/lib/modules";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";

export default async function UsersPage({ searchParams }: { searchParams: { ok?: string } }) {
  await requireAdmin();
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const perms = await db.select().from(schema.permissions);
  return (
    <>
      <PageHeader
        title="Utilisateurs & droits"
        subtitle="L'administrateur crée les comptes et attribue les modules à chaque utilisateur."
        actions={<Link href="/utilisateurs/nouveau" className="btn-primary">+ Nouvel utilisateur</Link>}
      />
      <Flash message={searchParams.ok ? "Modifications enregistrées." : ""} clear={["ok"]} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Modules accessibles</th><th>Statut</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const mine = perms.filter((p) => p.userId === u.id && p.level !== "none");
              return (
                <tr key={u.id} className="clickable">
                  <td>
                    <Link className="link row-hit" href={`/utilisateurs/${u.id}`}>{u.name}</Link>
                    {u.jobTitle && <div className="text-sm text-navy-600/70">{u.jobTitle}</div>}
                  </td>
                  <td className="text-navy-600">{u.email}</td>
                  <td><span className={u.role === "admin" ? "badge-navy" : u.role === "manager" ? "badge-gold" : "badge-gray"}>{roleLabel(u.role)}</span></td>
                  <td className="text-sm">
                    {u.role === "admin" ? "Tous" : mine.length === 0 ? <span className="text-navy-600/50">Aucun</span> : (
                      <span className="flex flex-wrap gap-1">
                        {mine.map((p) => (
                          <span key={p.module} className={p.level === "write" ? "badge-gold" : "badge-gray"}>
                            {MODULES.find((m) => m.key === p.module)?.label}{p.level === "read" ? " (lecture)" : ""}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td>{u.active ? <span className="badge-green">Actif</span> : <span className="badge-red">Désactivé</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
