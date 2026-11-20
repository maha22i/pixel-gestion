import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { toDoc } from "@/lib/contractData";
import { contractPdf } from "@/lib/contractPdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return new NextResponse("Non authentifié", { status: 401 });
  if (!can(user, "contrats")) return new NextResponse("Accès refusé", { status: 403 });
  const [row] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, Number(params.id)));
  if (!row) return new NextResponse("Introuvable", { status: 404 });
  const company = await getSettings();
  const buf = await contractPdf(toDoc(row), company);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${row.number || "contrat"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
