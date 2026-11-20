import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, getUser } from "@/lib/auth";
import { signedFilePath } from "@/lib/verification";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !can(user, "materiel")) return new Response("Accès refusé", { status: 403 });
  const [row] = await db.select().from(schema.equipmentVerifications).where(eq(schema.equipmentVerifications.id, Number(params.id)));
  if (!row?.signedStoredName) return new Response("Introuvable", { status: 404 });
  const full = signedFilePath(row.signedStoredName);
  if (!full || !fs.existsSync(full)) return new Response("Introuvable", { status: 404 });
  const buf = await fs.promises.readFile(full);
  const filename = (row.signedFilename || "verification-signee").replace(/"/g, "");
  return new Response(buf, {
    headers: {
      "Content-Type": row.signedMime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
