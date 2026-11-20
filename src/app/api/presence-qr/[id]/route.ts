import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { qrPng } from "@/lib/attendance/qrPoster";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const [site] = await db.select().from(schema.attendanceSites).where(eq(schema.attendanceSites.id, Number(params.id)));
  if (!site?.qrSecret) return new Response("QR absent", { status: 404 });
  const png = await qrPng(site.qrSecret);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
