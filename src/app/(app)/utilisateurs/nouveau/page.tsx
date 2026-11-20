import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { UserForm } from "../UserForm";
import { createUser } from "../actions";

const ERR: Record<string, string> = {
  champs: "Nom, email et mot de passe (8 caractères min.) sont obligatoires.",
  email: "Cet email est déjà utilisé.",
};

export default async function NewUser({ searchParams }: { searchParams: { e?: string } }) {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Nouvel utilisateur" back={{ href: "/utilisateurs", label: "Utilisateurs" }} />
      <Flash tone="error" message={searchParams.e ? ERR[searchParams.e] : ""} clear={["e"]} />
      <UserForm action={createUser} isNew />
    </>
  );
}
