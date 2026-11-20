import { eq } from "drizzle-orm";
import fs from "node:fs";
import { db, schema } from "@/db";
import { can, getUser } from "@/lib/auth";
import { equipmentFilePath, seesPrices } from "@/lib/equipment";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !can(user, "materiel")) return new Response("Accès refusé", { status: 403 });
  const [file] = await db.select().from(schema.equipmentFiles).where(eq(schema.equipmentFiles.id, Number(params.id)));
  if (!file) return new Response("Introuvable", { status: 404 });
  if (file.kind === "facture" && !seesPrices(user)) return new Response("Accès refusé", { status: 403 });
  const full = equipmentFilePath(file.storedName);
  if (!fs.existsSync(full)) return new Response("Introuvable", { status: 404 });
  const buf = await fs.promises.readFile(full);
  return new Response(buf, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
    },
  });
}
