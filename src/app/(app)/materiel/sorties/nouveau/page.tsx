import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { qtyAvailable, toLocalInput } from "@/lib/equipmentSlips";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { SlipForm } from "../SlipForm";

export default async function NewSlipPage({ searchParams }: { searchParams: { err?: string; msg?: string } }) {
  await requirePerm("materiel", "write");
  const people = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  const projectsRes = await db.execute(sql`
    SELECT p.id, p.title, c.name AS client_name FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id ORDER BY p.title`);
  const projects = (projectsRes.rows as { id: number; title: string; client_name: string | null }[]).map((p) => ({
    id: p.id, title: p.title, clientName: p.client_name,
  }));
  const categories = await db.select().from(schema.equipmentCategories);
  const equipmentRows = await db.select().from(schema.equipment).orderBy(asc(schema.equipment.name));
  const label = (id: number | null) => {
    const c = categories.find((x) => x.id === id);
    if (!c) return "Sans catégorie";
    const p = categories.find((x) => x.id === c.parentId);
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const equipment = await Promise.all(equipmentRows.map(async (e) => ({
    id: e.id, ref: e.ref, name: e.name, quantity: e.quantity, condition: e.condition,
    availability: e.availability, categoryId: e.categoryId, catLabel: label(e.categoryId),
    available: await qtyAvailable(e.id, e.quantity),
  })));
  const now = new Date();
  const later = new Date(now.getTime() + 24 * 3600 * 1000);

  return (
    <>
      <PageHeader title="Nouveau bon de sortie" back={{ href: "/materiel/sorties", label: "Sorties" }} />
      <Flash
        tone="error"
        className="mb-3"
        clear={["err", "msg"]}
        message={
          searchParams.err === "lignes" ? "Ajoutez au moins un matériel."
          : searchParams.err === "stock" ? (searchParams.msg ?? "Stock insuffisant.")
          : ""
        }
      />
      <SlipForm
        people={people}
        projects={projects}
        equipment={equipment}
        initial={{
          projectId: null, offProjectReason: null,
          outAt: toLocalInput(now), expectedReturn: toLocalInput(later),
          location: "", responsibleUserId: null, memberIds: [], notes: null, lines: [],
        }}
      />
    </>
  );
}
