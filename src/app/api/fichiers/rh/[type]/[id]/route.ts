import { eq } from "drizzle-orm";
import fs from "node:fs";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { proofPath } from "@/lib/proof";
import { canSeeLeave, canSeePayroll } from "@/lib/rh";

/** Certificats des demandes et contrats signés : visibles par l'intéressé et par les responsables autorisés. */
export async function GET(_req: Request, { params }: { params: { type: string; id: string } }) {
  const user = await getUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  const id = Number(params.id);
  let file: { owner: number; stored: string | null; mime: string | null; name: string | null } | null = null;
  let allowed = false;
  if (params.type === "demande") {
    const [r] = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
    if (r) { file = { owner: r.userId, stored: r.docStored, mime: r.docMime, name: r.docFilename }; allowed = r.userId === user.id || canSeeLeave(user); }
  } else if (params.type === "contrat") {
    const [c] = await db.select().from(schema.employmentContracts).where(eq(schema.employmentContracts.id, id));
    if (c) { file = { owner: c.userId, stored: c.docStored, mime: c.docMime, name: c.docFilename }; allowed = c.userId === user.id || canSeePayroll(user); }
  }
  if (!file?.stored) return new Response("Introuvable", { status: 404 });
  if (!allowed) return new Response("Accès refusé", { status: 403 });
  const full = proofPath(file.stored);
  if (!fs.existsSync(full)) return new Response("Introuvable", { status: 404 });
  return new Response(await fs.promises.readFile(full), {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${(file.name || "document").replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
