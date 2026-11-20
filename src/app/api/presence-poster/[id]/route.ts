import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { qrPosterPdf } from "@/lib/attendance/qrPoster";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const [site] = await db.select().from(schema.attendanceSites).where(eq(schema.attendanceSites.id, Number(params.id)));
  if (!site?.qrSecret) return new Response("QR absent", { status: 404 });
  const pdf = await qrPosterPdf(site.name, site.address, site.qrSecret);
  const filename = `pointage-${site.name.replace(/[^\w\-]+/g, "-")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
