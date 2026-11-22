import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "../ProjectForm";
import { createProject } from "../actions";

export default async function NewProject({ searchParams }: { searchParams: { client?: string; type?: string } }) {
  const user = await requirePerm("projets", "write");
  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name));
  const eventTypes = await db.select().from(schema.eventTypes).orderBy(asc(schema.eventTypes.position));
  const categories = await db.select().from(schema.projectCategories).orderBy(asc(schema.projectCategories.position));
  const people = await db
    .select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle, color: schema.users.color })
    .from(schema.users)
    .where(eq(schema.users.active, true))
    .orderBy(asc(schema.users.name));
  // Un non-administrateur ne voit que ses projets : on le met responsable par défaut pour qu'il garde l'accès.
  const self = user.role === "admin" ? null : user.id;
  const type = searchParams.type === "autonome" ? "autonome" : searchParams.type ?? "mariage";
  return (
    <>
      <PageHeader
        title="Nouveau projet"
        subtitle="Les tâches, devis, contrats et factures se rattachent ensuite au projet."
        back={{ href: "/projets", label: "Projets" }}
      />
      <div className="max-w-4xl">
        <ProjectForm
          action={createProject}
          p={{ clientId: Number(searchParams.client) || null, type, nature: type === "autonome" ? "interne" : "client", status: "prospect", ownerId: self }}
          clients={clients}
          eventTypes={eventTypes}
          categories={categories}
          people={people}
          memberIds={self ? [self] : []}
          cancelHref="/projets"
          newClientHref={can(user, "clients", "write") ? "/clients/nouveau?back=/projets/nouveau" : undefined}
        />
      </div>
    </>
  );
}
