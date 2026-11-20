import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { taskVisible } from "@/lib/tasks";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  const id = Number(params.id);
  const [file] = await db.select().from(schema.taskAttachments).where(eq(schema.taskAttachments.id, id));
  if (!file || !(await taskVisible(user, file.taskId))) return new Response("Accès refusé", { status: 403 });
  const full = path.join(process.cwd(), "data", "task-files", file.storedName);
  if (!fs.existsSync(full)) return new Response("Introuvable", { status: 404 });
  const buf = await fs.promises.readFile(full);
  return new Response(buf, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
    },
  });
}
