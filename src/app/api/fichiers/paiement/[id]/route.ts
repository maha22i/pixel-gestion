import { eq } from "drizzle-orm";
import fs from "node:fs";
import { db, schema } from "@/db";
import { can, getUser } from "@/lib/auth";
import { proofPath } from "@/lib/proof";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || (!can(user, "paiements") && !can(user, "factures"))) return new Response("Accès refusé", { status: user ? 403 : 401 });
  const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, Number(params.id)));
  if (!row?.proofStored) return new Response("Introuvable", { status: 404 });
  const full = proofPath(row.proofStored);
  if (!fs.existsSync(full)) return new Response("Introuvable", { status: 404 });
  const buf = await fs.promises.readFile(full);
  return new Response(buf, {
    headers: {
      "Content-Type": row.proofMime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${(row.proofFilename || "justificatif").replace(/"/g, "")}"`,
    },
  });
}
