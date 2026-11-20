import { NextResponse } from "next/server";
import { getUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { parseDraft } from "@/lib/contractData";
import { contractPdf, signatureMissing } from "@/lib/contractPdf";
import { resolvedDoc } from "@/lib/contractModel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (!can(user, "contrats", "write")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const draft = parseDraft(await req.json());
  const company = await getSettings();
  const { missing } = resolvedDoc(draft, company);
  if (signatureMissing(company, draft.includeSignature)) missing.push("signature");
  const buf = await contractPdf({ ...draft, number: draft.number }, company);
  return NextResponse.json({ pdf: buf.toString("base64"), missing });
}
