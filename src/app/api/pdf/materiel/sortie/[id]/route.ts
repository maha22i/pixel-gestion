import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, getUser } from "@/lib/auth";
import { renderSlipPdf } from "@/lib/equipmentSlipPdf";
import { canManageSlips } from "@/lib/equipmentSlips";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !can(user, "materiel")) return new Response("Accès refusé", { status: 403 });
  const id = Number(params.id);
  const [slip] = await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, id));
  if (!slip) return new Response("Introuvable", { status: 404 });
  if (!canManageSlips(user)) {
    const mine = await db.select().from(schema.equipmentSlipMembers).where(eq(schema.equipmentSlipMembers.userId, user.id));
    if (!mine.some((x) => x.slipId === id)) return new Response("Accès refusé", { status: 403 });
  }
  const members = await db.select().from(schema.equipmentSlipMembers).where(eq(schema.equipmentSlipMembers.slipId, id));
  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users);
  const items = await db.select().from(schema.equipmentSlipItems).where(eq(schema.equipmentSlipItems.slipId, id));
  const equipment = await db.select().from(schema.equipment);
  const cats = await db.select().from(schema.equipmentCategories);
  const project = slip.projectId ? (await db.select().from(schema.projects).where(eq(schema.projects.id, slip.projectId)))[0] : null;
  const client = project?.clientId ? (await db.select().from(schema.clients).where(eq(schema.clients.id, project.clientId)))[0] : null;
  const label = (cid: number | null) => {
    const c = cats.find((x) => x.id === cid);
    if (!c) return "—";
    const p = cats.find((x) => x.id === c.parentId);
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const name = (uid: number | null) => users.find((u) => u.id === uid)?.name ?? "—";
  const pdf = await renderSlipPdf({
    number: slip.number,
    kind: "sortie",
    status: slip.status,
    projectTitle: project?.title ?? null,
    clientName: client?.name ?? null,
    offProjectReason: slip.offProjectReason,
    location: slip.location,
    outAt: slip.outAt.toISOString(),
    expectedReturnAt: slip.expectedReturnAt.toISOString(),
    team: members.map((m) => name(m.userId)),
    responsible: name(slip.responsibleUserId),
    notes: slip.notes,
    items: items.map((i) => {
      const e = equipment.find((x) => x.id === i.equipmentId);
      return {
        ref: e?.ref ?? "—", name: e?.name ?? "—", category: label(e?.categoryId ?? null),
        quantity: i.quantity, conditionOut: i.conditionOut, noteOut: i.noteOut,
      };
    }),
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slip.number}-sortie.pdf"`,
    },
  });
}
