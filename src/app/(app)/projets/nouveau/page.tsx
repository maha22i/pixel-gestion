import { asc } from "drizzle-orm";
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
  const people = await db.select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle }).from(schema.users).orderBy(asc(schema.users.name));
  return (
    <>
      <PageHeader title="Nouveau projet" back={{ href: "/projets", label: "Projets" }} />
      <div className="max-w-3xl">
        <ProjectForm
          action={createProject}
          p={{ clientId: Number(searchParams.client) || null, type: searchParams.type ?? "mariage", status: "prospect" }}
          clients={clients}
          eventTypes={eventTypes}
          categories={categories}
          people={people}
          newClientHref={can(user, "clients", "write") ? "/clients/nouveau?back=/projets/nouveau" : undefined}
        />
      </div>
    </>
  );
}
