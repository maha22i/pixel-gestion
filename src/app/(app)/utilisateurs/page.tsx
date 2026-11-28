import Link from "next/link";
import { asc, gte, isNull, or } from "drizzle-orm";
import { Pencil, Plus, ShieldCheck, Users } from "lucide-react";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { MODULES, normalizeRole, roleLabel } from "@/lib/modules";
import { effectivePerms, roleDefaults } from "@/lib/permissions";
import { CONTRACT_TYPE } from "@/lib/rh";
import { today } from "@/lib/format";
import { Avatar, PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { Modal } from "@/components/Modal";
import { createUser, deleteUser, updateAccount, updatePermissions } from "./actions";
import { AccountForm, PermissionsForm } from "./UserModals";

const OK: Record<string, string> = {
  cree: "Utilisateur créé avec les droits de son rôle.",
  compte: "Compte mis à jour.",
  droits: "Droits mis à jour. Ils s'appliquent dès sa prochaine page.",
  supprime: "Compte supprimé.",
  "1": "Modifications enregistrées.",
};
const ERR: Record<string, string> = {
  champs: "Nom, e-mail et mot de passe (8 caractères minimum) sont obligatoires.",
  email: "Cet e-mail est déjà utilisé par un autre compte.",
  mdp: "Le mot de passe doit faire 8 caractères minimum.",
  contrat: "Dates du contrat invalides : la date de début est obligatoire, et la fin (obligatoire pour un CDD ou un stage) doit être après le début.",
  avatar: "La photo doit être une image PNG ou JPEG de moins de 2 Mo.",
};
const ROLE_BADGE: Record<string, string> = { admin: "badge-navy", manager: "badge-gold", technician: "badge-gray" };

export default async function UsersPage({ searchParams }: { searchParams: { ok?: string; e?: string; droits?: string; modifier?: string; nouveau?: string } }) {
  const me = await requireAdmin();
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const perms = await db.select().from(schema.permissions);
  const defaults = await roleDefaults();
  const effective = (u: { id: number; role: string }) => effectivePerms(u.role, defaults, perms.filter((p) => p.userId === u.id));
  const rights = users.find((u) => u.id === Number(searchParams.droits));
  const editing = users.find((u) => u.id === Number(searchParams.modifier));
  const day = today();
  // Contrat en cours, sinon le prochain à commencer (non terminé dans les deux cas).
  const contracts = new Map<number, typeof schema.employmentContracts.$inferSelect>();
  const openContracts = await db.select().from(schema.employmentContracts)
    .where(or(isNull(schema.employmentContracts.endDate), gte(schema.employmentContracts.endDate, day)))
    .orderBy(asc(schema.employmentContracts.startDate));
  for (const c of openContracts) {
    const prev = contracts.get(c.userId);
    if (!prev || (prev.startDate > day ? c.startDate < prev.startDate : c.startDate <= day)) contracts.set(c.userId, c);
  }
  const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const icon = "grid h-9 w-9 place-items-center rounded-lg border border-navy-100 bg-white text-navy-600 transition hover:border-navy-200 hover:bg-navy-50 hover:text-navy";

  return (
    <>
      <PageHeader
        title="Utilisateurs & droits"
        subtitle={`${users.filter((u) => u.active).length} comptes actifs. Le bouclier règle les droits, le crayon modifie le compte.`}
        actions={<Link href="/utilisateurs?nouveau=1" scroll={false} className="btn-gold"><Plus size={16} /> Nouvel utilisateur</Link>}
      />
      <Flash message={!searchParams.droits || searchParams.ok === "cree" ? OK[searchParams.ok ?? ""] ?? "" : ""} clear={["ok"]} />

      <div className="card overflow-x-auto">
        {users.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-navy-600/70"><Users size={28} /> Aucun utilisateur.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Accès</th><th>Statut</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const eff = effective(u);
                const open = MODULES.filter((m) => eff[m.key] !== "none").length;
                const writes = MODULES.filter((m) => eff[m.key] === "write").length;
                const base = defaults[normalizeRole(u.role)];
                const custom = u.role === "admin" ? 0 : MODULES.filter((m) => eff[m.key] !== base[m.key]).length;
                return (
                  <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                    <td>
                      <span className="flex items-center gap-3">
                        {u.avatarPath ? <img src={u.avatarPath} alt="" className="h-9 w-9 rounded-full object-cover" /> : <Avatar name={u.name} color={u.color} size={36} />}
                        <span className="min-w-0">
                          <span className="block font-bold text-navy">{u.name}{u.id === me.id && <span className="ml-1.5 text-xs font-normal text-navy-600/60">(vous)</span>}</span>
                          <span className="block truncate text-xs text-navy-600/70">{u.email}{u.jobTitle ? ` · ${u.jobTitle}` : ""}</span>
                        </span>
                      </span>
                    </td>
                    <td><span className={ROLE_BADGE[u.role] ?? "badge-gray"}>{roleLabel(u.role)}</span></td>
                    <td className="text-sm text-navy-700">
                      {u.role === "admin" ? "Tous les modules" : open === 0 ? <span className="text-navy-600/50">Aucun accès</span> : (
                        <span>{open} module{open > 1 ? "s" : ""}<span className="text-navy-600/60"> · dont {writes} en écriture</span></span>
                      )}
                      {u.role !== "admin" && (custom > 0
                        ? <span className="badge-gold mt-1 flex w-fit">{custom} personnalisé{custom > 1 ? "s" : ""}</span>
                        : <span className="mt-1 block text-xs text-navy-600/55">Droits du rôle</span>)}
                    </td>
                    <td>
                      {u.active ? <span className="badge-green">Actif</span> : <span className="badge-red">Désactivé</span>}
                      {(() => {
                        const c = contracts.get(u.id);
                        if (!c) return null;
                        const soon = c.endDate && c.endDate <= new Date(Date.parse(`${day}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
                        return (
                          <span className={`mt-1 block text-xs ${soon ? "font-semibold text-amber-800" : "text-navy-600/65"}`}>
                            {CONTRACT_TYPE[c.contractType] ?? c.contractType}
                            {c.startDate > day ? ` · débute le ${shortDate(c.startDate)}` : c.endDate ? ` · fin le ${shortDate(c.endDate)}` : " · indéterminé"}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <span className="flex justify-end gap-1.5">
                        <Link href={`/utilisateurs?droits=${u.id}`} scroll={false} className={icon} aria-label={`Droits de ${u.name}`} title="Droits"><ShieldCheck size={17} /></Link>
                        <Link href={`/utilisateurs?modifier=${u.id}`} scroll={false} className={icon} aria-label={`Modifier ${u.name}`} title="Modifier"><Pencil size={16} /></Link>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {rights && (
        <Modal closeHref="/utilisateurs" labelledBy="user-modal-title" width="max-w-2xl">
          {searchParams.ok === "cree" && <p className="mx-5 mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 sm:mx-6">Compte créé : il suit les droits par défaut de son rôle. Personnalisez-les ici si besoin.</p>}
          <PermissionsForm action={updatePermissions.bind(null, rights.id)} user={rights} perms={effective(rights)} defaults={defaults} isSelf={rights.id === me.id} />
        </Modal>
      )}
      {editing && (
        <Modal closeHref="/utilisateurs" labelledBy="user-modal-title" width="max-w-2xl">
          <AccountForm
            action={updateAccount.bind(null, editing.id)}
            user={editing}
            userId={editing.id}
            today={day}
            contract={(() => { const c = contracts.get(editing.id); return c ? { type: c.contractType, start: c.startDate, end: c.endDate } : null; })()}
            isSelf={editing.id === me.id}
            error={ERR[searchParams.e ?? ""]}
            deleteAction={editing.id === me.id ? undefined : deleteUser.bind(null, editing.id)}
          />
        </Modal>
      )}
      {searchParams.nouveau && (
        <Modal closeHref="/utilisateurs" labelledBy="user-modal-title" width="max-w-2xl">
          <AccountForm action={createUser} isNew today={day} error={ERR[searchParams.e ?? ""]} />
        </Modal>
      )}
    </>
  );
}
