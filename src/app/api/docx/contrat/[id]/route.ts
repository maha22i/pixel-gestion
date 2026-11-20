import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { toDoc } from "@/lib/contractData";
import { contractDocx } from "@/lib/contractDocx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return new NextResponse("Non authentifié", { status: 401 });
  if (!can(user, "contrats")) return new NextResponse("Accès refusé", { status: 403 });
  const [row] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, Number(params.id)));
  if (!row) return new NextResponse("Introuvable", { status: 404 });
  const buf = await contractDocx(toDoc(row), await getSettings());
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${row.number || "contrat"}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
