import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { MODULES } from "@/lib/modules";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { UserForm } from "../UserForm";
import { deleteUser, updateUser } from "../actions";

const ERR: Record<string, string> = { email: "Cet email est déjà utilisé.", mdp: "Le mot de passe doit faire 8 caractères minimum." };

export default async function EditUser({ params, searchParams }: { params: { id: string }; searchParams: { e?: string } }) {
  const me = await requireAdmin();
  const id = Number(params.id);
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) notFound();
  const rows = await db.select().from(schema.permissions).where(eq(schema.permissions.userId, id));
  const perms = Object.fromEntries(MODULES.map((m) => [m.key, rows.find((r) => r.module === m.key)?.level ?? "none"]));
  const isSelf = me.id === id;
  return (
    <>
      <PageHeader
        title={u.name}
        subtitle={u.email}
        back={{ href: "/utilisateurs", label: "Utilisateurs" }}
        actions={!isSelf && (
          <form action={deleteUser.bind(null, id)}>
            <ConfirmButton message={`Supprimer définitivement ${u.name} ?`}>Supprimer</ConfirmButton>
          </form>
        )}
      />
      <Flash tone="error" message={searchParams.e ? ERR[searchParams.e] : ""} clear={["e"]} />
      <UserForm action={updateUser.bind(null, id)} initial={{ name: u.name, email: u.email, role: u.role, active: u.active, jobTitle: u.jobTitle, phone: u.phone, color: u.color, avatarPath: u.avatarPath, perms }} isSelf={isSelf} />
    </>
  );
}
