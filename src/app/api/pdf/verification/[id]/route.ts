import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, getUser } from "@/lib/auth";
import { renderVerificationPdf } from "@/lib/verificationPdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !can(user, "materiel")) return new Response("Accès refusé", { status: 403 });
  const id = Number(params.id);
  const [row] = await db.select().from(schema.equipmentVerifications).where(eq(schema.equipmentVerifications.id, id));
  if (!row) return new Response("Introuvable", { status: 404 });
  const lines = await db.select().from(schema.equipmentVerificationLines)
    .where(eq(schema.equipmentVerificationLines.verificationId, id))
    .orderBy(asc(schema.equipmentVerificationLines.position));
  const pdf = await renderVerificationPdf({
    weekStart: String(row.weekStart).slice(0, 10),
    generatedAt: row.generatedAt,
    lines,
  });
  const name = `verification-${String(row.weekStart).slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
