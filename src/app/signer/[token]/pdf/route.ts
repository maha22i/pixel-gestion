import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { renderQuotePdf } from "@/lib/renderQuotePdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const [q] = await db.select({ id: schema.quotes.id }).from(schema.quotes).where(eq(schema.quotes.signToken, params.token));
  if (!q) return new NextResponse("Introuvable", { status: 404 });
  const built = await renderQuotePdf(q.id);
  if (!built) return new NextResponse("Introuvable", { status: 404 });
  return new NextResponse(new Uint8Array(built.buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${built.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
